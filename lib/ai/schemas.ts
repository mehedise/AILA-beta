import { z } from "zod";

export const BusinessCardDraftSchema = z.object({
  name: z.string().nullable(),
  title: z.string().nullable(),
  company: z.string().nullable(),
  emails: z.array(z.string()),
  phones: z.array(z.string()),
  websites: z.array(z.string()),
  address: z.string().nullable(),
  raw_text: z.string(),
  confidence: z.number().min(0).max(1),
  notes: z.string().nullable(),
});

export type BusinessCardDraft = z.infer<typeof BusinessCardDraftSchema>;

const FieldConfidenceSchema = z.object({
  value: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  source: z.enum([
    "text_layer",
    "vision",
    "agreed",
    "vision_corrected",
  ]),
  unreadable: z.boolean(),
});

export const VerifiedCardSchema = z.object({
  name: FieldConfidenceSchema,
  title: FieldConfidenceSchema,
  company: FieldConfidenceSchema,
  emails: z.array(FieldConfidenceSchema),
  phones: z.array(FieldConfidenceSchema),
  websites: z.array(FieldConfidenceSchema),
  address: FieldConfidenceSchema,
  overall_confidence: z.number().min(0).max(1),
  issues: z.array(
    z.object({
      field: z.string(),
      severity: z.enum(["info", "warning", "error"]),
      message: z.string(),
    })
  ),
});

export type VerifiedCard = z.infer<typeof VerifiedCardSchema>;
export type FieldConfidence = z.infer<typeof FieldConfidenceSchema>;

export function flattenVerifiedCard(verified: VerifiedCard) {
  const first = <T extends { value: string | null }>(arr: T[]) =>
    arr[0]?.value ?? null;
  return {
    name: verified.name.value,
    title: verified.title.value,
    company: verified.company.value,
    email: first(verified.emails),
    phone: first(verified.phones),
    website: first(verified.websites),
    address: verified.address.value,
    confidence: verified.overall_confidence,
    fieldConfidence: {
      name: verified.name,
      title: verified.title,
      company: verified.company,
      emails: verified.emails,
      phones: verified.phones,
      websites: verified.websites,
      address: verified.address,
    },
    issues: verified.issues,
  };
}
