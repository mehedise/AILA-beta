import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";

const ENRICH_MODEL = process.env.OPENAI_ENRICH_MODEL || "gpt-4.1-mini";

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

const INFERENCE_FILLABLE_FIELDS = new Set<keyof EnrichmentInput>([
  "displayName",
  "firstName",
  "lastName",
  "title",
  "company",
  "website",
  "address",
  "city",
  "zipCode",
  "country",
  "annualRevenue",
  "employeeHeadcount",
]);

function missingFieldKeys(input: EnrichmentInput): (keyof EnrichmentInput)[] {
  return (Object.keys(FIELD_LABELS) as (keyof EnrichmentInput)[]).filter(
    (k) => !input[k] || String(input[k]).trim() === ""
  );
}

function labelsFor(keys: (keyof EnrichmentInput)[]): string[] {
  return keys.map((key) => FIELD_LABELS[key]);
}

export function needsInferenceEnrichment(input: EnrichmentInput): boolean {
  return missingFieldKeys(input).some((key) => INFERENCE_FILLABLE_FIELDS.has(key));
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
          "For address, city, and zip/postal code, only fill values when you can confidently identify the company's public business location; do not guess a street address or postal code. " +
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
  mode: "inference";
}> {
  const missingKeys = missingFieldKeys(input);
  if (missingKeys.length === 0) {
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

  const inferableMissing = missingKeys.filter((key) =>
    INFERENCE_FILLABLE_FIELDS.has(key)
  );

  if (inferableMissing.length === 0) {
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
        notes: "no_inference_fillable_missing_fields",
      },
      mode: "inference",
    };
  }

  const inferred = await fallbackEnrichment(input, labelsFor(inferableMissing));
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
