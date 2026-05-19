import { structuredCompletion } from "./openai";
import {
  BusinessCardDraft,
  VerifiedCardSchema,
  type VerifiedCard,
} from "./schemas";

export async function verifyCardAgainstImage(
  draft: BusinessCardDraft,
  imageUrl: string
): Promise<VerifiedCard> {
  return structuredCompletion(
    VerifiedCardSchema,
    "verified_card",
    [
      {
        role: "system",
        content:
          "You verify business card data against a card image. For each field, compare the draft with the image. " +
          "Rules:\n" +
          "- If the image clearly confirms the draft, source='agreed', high confidence.\n" +
          "- If the image shows different text, replace it, source='vision_corrected'.\n" +
          "- If the image is too blurry to verify, set unreadable=true and use draft with low confidence.\n" +
          "- If you read text in the image that the draft missed, add it.\n" +
          "- Never invent data. Null is acceptable.\n" +
          "- Add an 'issues' entry for blurry, ambiguous, or disagreeing fields.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Draft extracted from PDF text layer:\n${JSON.stringify(draft, null, 2)}`,
          },
          {
            type: "image_url",
            image_url: { url: imageUrl, detail: "high" },
          },
        ],
      },
    ],
    { cacheKey: "aila_card_verify_v1" }
  );
}
