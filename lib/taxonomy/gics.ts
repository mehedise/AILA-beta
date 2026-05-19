import {
  GICS_ENTRIES,
  GICS_ENTRY_KEYS,
  type GicsEntry,
} from "@/lib/taxonomy/gics-entries.generated";

export type { GicsEntry };
export { GICS_ENTRIES, GICS_ENTRY_KEYS };

const GICS_BY_KEY = new Map(GICS_ENTRIES.map((e) => [e.key, e]));
const GICS_BY_SUB_INDUSTRY_ID = new Map(
  GICS_ENTRIES.map((e) => [e.subIndustryId, e])
);

export function getGicsEntry(key: string): GicsEntry | undefined {
  return GICS_BY_KEY.get(key) ?? GICS_BY_SUB_INDUSTRY_ID.get(key);
}

export function formatGicsLabel(entry: GicsEntry): string {
  return `${entry.sector} › ${entry.industryGroup} › ${entry.industry} › ${entry.subIndustry}`;
}

const STOP_WORDS = new Set([
  "and",
  "the",
  "for",
  "with",
  "from",
  "into",
  "your",
  "this",
  "that",
  "ltd",
  "pte",
  "sdn",
  "bhd",
  "inc",
  "llc",
  "co",
  "company",
  "services",
  "service",
  "other",
  "activities",
  "nec",
]);

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}

export function buildGicsCandidates(item: {
  company?: string | null;
  website?: string | null;
  title?: string | null;
  raw_text?: string | null;
}): GicsEntry[] {
  const context = `${item.company ?? ""} ${item.website ?? ""} ${item.title ?? ""} ${
    item.raw_text ?? ""
  }`.slice(0, 1200);
  const tokens = new Set(tokenize(context));

  const scored = GICS_ENTRIES.map((entry) => {
    const haystack = tokenize(
      `${entry.sector} ${entry.industryGroup} ${entry.industry} ${entry.subIndustry} ${entry.subIndustryDescription}`
    );
    let score = 0;
    for (const token of haystack) {
      if (tokens.has(token)) score += 1;
    }
    return { entry, score };
  })
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 40)
    .map((s) => s.entry);

  const merged = new Map<string, GicsEntry>();
  for (const e of scored) merged.set(e.key, e);

  if (merged.size < 25) {
    for (const e of GICS_ENTRIES) {
      if (!merged.has(e.key)) merged.set(e.key, e);
      if (merged.size >= 40) break;
    }
  }

  return Array.from(merged.values()).slice(0, 40);
}

export const GICS_SECTORS = Array.from(
  new Map(GICS_ENTRIES.map((e) => [e.sectorId, e.sector])).entries()
).map(([code, name]) => ({ code, name }));
