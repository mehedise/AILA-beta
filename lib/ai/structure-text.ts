import { structuredCompletion, MODEL } from "./openai";
import { BusinessCardDraftSchema } from "./schemas";

export async function structureCardFromText(
  rawText: string,
  annotationUrls: string[] = []
): Promise<import("./schemas").BusinessCardDraft> {
  const linksBlock =
    annotationUrls.length > 0
      ? `\n\nHyperlinks from PDF annotations:\n${annotationUrls.join("\n")}`
      : "";

  return structuredCompletion(
    BusinessCardDraftSchema,
    "business_card_draft",
    [
      {
        role: "system",
        content:
          "You extract structured contact data from raw text scraped from a single business card PDF page. " +
          "Text order may be jumbled. Return null for missing fields. Do not invent data. " +
          "Phones: digits with country code when visible. Include all emails and phones found.",
      },
      {
        role: "user",
        content: `Extract business card fields from this text:${linksBlock}\n\n---\n${rawText}`,
      },
    ],
    { cacheKey: "aila_card_structure_v1" }
  );
}

export { MODEL };
