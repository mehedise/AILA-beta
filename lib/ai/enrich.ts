import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat, zodTextFormat } from "openai/helpers/zod";

const ENRICH_MODEL = process.env.OPENAI_ENRICH_MODEL || "gpt-4.1-mini";
const SEARCH_MODEL = process.env.OPENAI_ENRICH_SEARCH_MODEL || ENRICH_MODEL;

// Web search via the Responses API costs ~$25 / 1,000 calls — by far the
// dominant per-lead cost. Disabled by default; flip `ENRICH_USE_SEARCH=1`
// in the environment to opt in.
const USE_WEB_SEARCH =
  (process.env.ENRICH_USE_SEARCH ?? "").toLowerCase() === "1" ||
  (process.env.ENRICH_USE_SEARCH ?? "").toLowerCase() === "true";

export const LeadEnrichmentSchema = z.object({
  displayName: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  title: z.string().nullable(),
  company: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  mobile: z.string().nullable(),
  website: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  zipCode: z.string().nullable(),
  country: z.string().nullable(),
  annualRevenue: z.string().nullable(),
  employeeHeadcount: z.string().nullable(),
  fieldSources: z
    .object({
      displayName: z.string().nullable(),
      firstName: z.string().nullable(),
      lastName: z.string().nullable(),
      title: z.string().nullable(),
      company: z.string().nullable(),
      email: z.string().nullable(),
      phone: z.string().nullable(),
      mobile: z.string().nullable(),
      website: z.string().nullable(),
      address: z.string().nullable(),
      city: z.string().nullable(),
      zipCode: z.string().nullable(),
      country: z.string().nullable(),
      annualRevenue: z.string().nullable(),
      employeeHeadcount: z.string().nullable(),
    })
    .nullable(),
  notes: z.string().nullable(),
});

export type LeadEnrichment = z.infer<typeof LeadEnrichmentSchema>;

export type EnrichmentInput = {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  title?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  zipCode?: string | null;
  country?: string | null;
  annualRevenue?: string | null;
  employeeHeadcount?: string | null;
};

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    _openai = new OpenAI({
      apiKey,
      timeout: 60_000,
      maxRetries: 2,
    });
  }
  return _openai;
}

const FIELD_LABELS: Record<keyof EnrichmentInput, string> = {
  displayName: "Display Name",
  firstName: "First Name",
  lastName: "Last Name",
  title: "Position / Title",
  company: "Company",
  email: "Email",
  phone: "Office Telephone",
  mobile: "Mobile",
  website: "Website",
  address: "Address",
  city: "City",
  zipCode: "Zip / Postal Code",
  country: "Country",
  annualRevenue: "Annual Revenue",
  employeeHeadcount: "Employee Headcount",
};

function missingFields(input: EnrichmentInput): string[] {
  return (Object.keys(FIELD_LABELS) as (keyof EnrichmentInput)[])
    .filter((k) => !input[k] || String(input[k]).trim() === "")
    .map((k) => FIELD_LABELS[k]);
}

async function trySearchEnabledEnrichment(
  payload: EnrichmentInput,
  missing: string[]
): Promise<LeadEnrichment | null> {
  if (!USE_WEB_SEARCH) return null;
  const openai = getOpenAI();
  // Responses API may not be present on very old SDKs. v6+ supports it.
  if (!openai.responses?.parse) return null;

  try {
    const res = await openai.responses.parse({
      model: SEARCH_MODEL,
      tools: [{ type: "web_search_preview" }],
      input: [
        {
          role: "system",
          content:
            "You are a B2B lead enrichment assistant. " +
            "You are given a partial lead. Use the web search tool to find authoritative public information " +
            "(company website, LinkedIn, Crunchbase, news articles, regulatory filings) to fill MISSING fields ONLY. " +
            "Never overwrite fields that are already present. If a field cannot be confirmed, return null. " +
            "Return the FULL lead with both supplied and newly found fields. " +
            "For annualRevenue use ranges like '$1M-$10M' if exact is unknown. " +
            "For employeeHeadcount use ranges like '11-50'. " +
            "In fieldSources, write a short citation/URL for each field you filled.",
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Known lead:\n${JSON.stringify(payload, null, 2)}`,
            },
            {
              type: "input_text",
              text: `Missing fields to fill if you can confirm: ${missing.join(", ")}`,
            },
          ],
        },
      ],
      text: {
        format: zodTextFormat(LeadEnrichmentSchema, "lead_enrichment"),
      },
    });
    return res.output_parsed ?? null;
  } catch (err) {
    // Don't crash the whole enrichment if the Responses API rejects the
    // request (e.g. model doesn't support web_search_preview, account
    // doesn't have access, rate limited, etc.). Surface to logs so we can
    // see why we fell back to plain inference.
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[enrich] Responses API search failed: ${message}`);
    return null;
  }
}

async function fallbackEnrichment(
  payload: EnrichmentInput,
  missing: string[]
): Promise<LeadEnrichment> {
  const response = await getOpenAI().chat.completions.parse({
    model: ENRICH_MODEL,
    response_format: zodResponseFormat(LeadEnrichmentSchema, "lead_enrichment"),
    prompt_cache_key: "aila_enrich_fallback_v1",
    messages: [
      {
        role: "system",
        content:
          "You are a B2B lead enrichment assistant. Fill MISSING fields based on prior knowledge of the company. " +
          "Never invent personal data (emails, phones) you don't actually know. " +
          "Never overwrite fields that are already present. If unsure, return null. " +
          "For annualRevenue use ranges like '$1M-$10M'. " +
          "For employeeHeadcount use ranges like '11-50'. " +
          "In fieldSources, write a brief justification per field (e.g., 'inferred from company name', or 'from website domain').",
      },
      {
        role: "user",
        content: `Known lead:\n${JSON.stringify(payload, null, 2)}\n\nFill these missing fields if you can: ${missing.join(", ")}`,
      },
    ],
  });

  const choice = response.choices[0]?.message;
  if (choice?.refusal) {
    throw new Error(`Enrichment refused by model: ${choice.refusal}`);
  }
  const parsed = choice?.parsed;
  if (!parsed) throw new Error("Enrichment returned no result");
  return parsed;
}

export async function enrichLead(input: EnrichmentInput): Promise<{
  enrichment: LeadEnrichment;
  mode: "web_search" | "inference";
}> {
  const missing = missingFields(input);
  if (missing.length === 0) {
    return {
      enrichment: {
        ...input,
        displayName: input.displayName ?? null,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        title: input.title ?? null,
        company: input.company ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        mobile: input.mobile ?? null,
        website: input.website ?? null,
        address: input.address ?? null,
        city: input.city ?? null,
        zipCode: input.zipCode ?? null,
        country: input.country ?? null,
        annualRevenue: input.annualRevenue ?? null,
        employeeHeadcount: input.employeeHeadcount ?? null,
        fieldSources: null,
        notes: "no_missing_fields",
      },
      mode: "inference",
    };
  }

  const searched = await trySearchEnabledEnrichment(input, missing);
  if (searched) return { enrichment: searched, mode: "web_search" };

  const inferred = await fallbackEnrichment(input, missing);
  return { enrichment: inferred, mode: "inference" };
}

/** Return only the values we should actually write back (don't overwrite existing). */
export function mergeEnrichment(
  existing: EnrichmentInput,
  enrichment: LeadEnrichment
): Partial<EnrichmentInput> {
  const out: Partial<EnrichmentInput> = {};
  for (const key of Object.keys(FIELD_LABELS) as (keyof EnrichmentInput)[]) {
    const cur = existing[key];
    if (cur && String(cur).trim()) continue;
    const next = enrichment[key];
    if (next && String(next).trim()) {
      out[key] = String(next).trim();
    }
  }
  return out;
}
