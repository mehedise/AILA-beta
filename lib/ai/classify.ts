import { z } from "zod";
import { structuredCompletion } from "./openai";
import {
  buildGicsCandidates,
  getGicsEntry,
  GICS_ENTRY_KEYS,
  type GicsEntry,
} from "@/lib/taxonomy/gics";

const SUB_INDUSTRY_ID_REGEX = /^\d{8}$/;

const ClassificationResultSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      subIndustryId: z.string().regex(SUB_INDUSTRY_ID_REGEX),
      confidence: z.number().min(0).max(1),
      reasoning: z.string(),
    })
  ),
});

export type ClassificationInput = {
  id: string;
  company?: string | null;
  website?: string | null;
  title?: string | null;
  raw_text?: string | null;
};

export type ClassificationResult = {
  id: string;
  classificationKey: string;
  confidence: number;
  reasoning: string;
  gics: GicsEntry;
};

const KEY_SET = new Set<string>(GICS_ENTRY_KEYS);

const MAX_CANDIDATES_PER_BATCH = 80;

export async function classifyIndustries(
  items: ClassificationInput[]
): Promise<ClassificationResult[]> {
  if (items.length === 0) return [];

  // Build a single unioned candidate set for the whole batch. This is the
  // dominant token cost and was previously duplicated per-lead — now we
  // send it once per batch which the model can reuse across all items.
  const candidateMap = new Map<string, GicsEntry>();
  for (const item of items) {
    for (const c of buildGicsCandidates(item)) {
      if (!candidateMap.has(c.key)) {
        candidateMap.set(c.key, c);
        if (candidateMap.size >= MAX_CANDIDATES_PER_BATCH) break;
      }
    }
    if (candidateMap.size >= MAX_CANDIDATES_PER_BATCH) break;
  }

  const candidates = Array.from(candidateMap.values()).map((c) => ({
    sub_industry_id: c.subIndustryId,
    sector: c.sector,
    industry_group: c.industryGroup,
    industry: c.industry,
    sub_industry: c.subIndustry,
    sub_industry_description: c.subIndustryDescription.slice(0, 200),
  }));

  const leads = items.map((item) => ({
    id: item.id,
    company: item.company ?? "",
    website: item.website ?? "",
    title: item.title ?? "",
    raw_text: (item.raw_text ?? "").slice(0, 500),
  }));

  const result = await structuredCompletion(
    ClassificationResultSchema,
    "gics_classification",
    [
      {
        role: "system",
        content:
          "You classify companies using the Global Industry Classification Standard (GICS) 2023. " +
          "For each lead in `leads`, choose exactly one sub_industry_id from the shared `gics_candidates` list. " +
          "Each candidate includes sector, industry_group, industry, sub_industry, and sub_industry_description. " +
          "Use company name, job title, website, and notes to pick the best match. " +
          "Return one result per input id, in any order.",
      },
      {
        role: "user",
        content: JSON.stringify({ gics_candidates: candidates, leads }),
      },
    ],
    { cacheKey: "aila_gics_classify_v1" }
  );

  const byId = new Map<string, ClassificationResult>();
  for (const entry of result.results) {
    const key = KEY_SET.has(entry.subIndustryId)
      ? entry.subIndustryId
      : GICS_ENTRY_KEYS[0];
    const gics = getGicsEntry(key);
    if (!gics) {
      throw new Error(`Unknown GICS sub-industry id: ${key}`);
    }
    byId.set(entry.id, {
      id: entry.id,
      classificationKey: key,
      confidence: entry.confidence,
      reasoning: entry.reasoning,
      gics,
    });
  }

  // Preserve input order. If the model omits an item, keep the batch moving by
  // assigning the first candidate with low confidence instead of failing the
  // entire import.
  return items.map((item) => {
    const hit = byId.get(item.id);
    if (hit) return hit;

    const fallback = buildGicsCandidates(item)[0] ?? getGicsEntry(GICS_ENTRY_KEYS[0]);
    if (!fallback) {
      throw new Error(`No fallback GICS candidate for id: ${item.id}`);
    }

    return {
      id: item.id,
      classificationKey: fallback.key,
      confidence: 0.2,
      reasoning: "Fallback classification used because the model omitted this lead from the batch response.",
      gics: fallback,
    };
  });
}

export async function classifySingle(
  item: ClassificationInput
): Promise<ClassificationResult> {
  const [result] = await classifyIndustries([item]);
  if (!result) throw new Error("Classification returned no result");
  return result;
}
