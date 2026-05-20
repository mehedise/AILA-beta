import { eq, sql } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db/client";
import { extractedLeads, imports } from "@/lib/db/schema";
import { downloadPdfFromR2 } from "@/lib/pdf/load";
import { prerenderPdfChunk } from "@/lib/pdf/prerender";
import {
  getPageImageSignedUrl,
  readPageArtifact,
} from "@/lib/pdf/page-artifacts";
import { structureCardFromText } from "@/lib/ai/structure-text";
import { verifyCardAgainstImage } from "@/lib/ai/verify-card";
import { flattenVerifiedCard } from "@/lib/ai/schemas";
import type { BusinessCardDraft, VerifiedCard } from "@/lib/ai/schemas";
import { MODEL } from "@/lib/ai/structure-text";
import {
  normalizeEmail,
  normalizePhone,
  normalizeWebsite,
  logoFromWebsite,
} from "@/lib/excel/normalize";

const TEXT_RICH_THRESHOLD = 30;

/**
 * When the text-only structuring draft hits at least this confidence we
 * trust it and skip the vision verification round-trip. Saves one OpenAI
 * vision call per text-rich page (the common case for digital PDFs).
 */
const SKIP_VISION_CONFIDENCE = 0.7;

export const extractPage = inngest.createFunction(
  {
    id: "extract-page",
    concurrency: { limit: 10 },
    // The expensive PDF download + parse is now amortized in process-pdf's
    // prerender step, so a single try per page is plenty. Graceful AI
    // fallbacks below ensure the row always saves.
    retries: 1,
    triggers: [{ event: "import/pdf.page.extract" }],
  },
  async ({ event, step }) => {
    const { importId, fileKey, pageNumber } = event.data as {
      importId: string;
      fileKey: string;
      pageNumber: number;
    };

    // Happy path: prerender already wrote a small JSON + (optionally) a
    // PNG to R2 for this page. Two cheap reads vs. re-pulling and
    // re-parsing the whole source PDF.
    const pageData = await step.run("load-artifact", async () => {
      let artifact = await readPageArtifact(importId, pageNumber);

      // Fallback for legacy imports created before prerender existed, or
      // for retries on pages where prerender never ran. Do it on the fly
      // (and persist for next time).
      if (!artifact) {
        console.warn(
          `[extract-page] artifact missing for ${importId} p${pageNumber}, falling back to on-the-fly prerender`
        );
        const pdfBuffer = await downloadPdfFromR2(fileKey);
        await prerenderPdfChunk(pdfBuffer, importId, pageNumber, pageNumber, {
          forceImage: true,
        });
        artifact = await readPageArtifact(importId, pageNumber);
      }

      const text = (artifact?.text ?? "").replace(/\s+/g, " ").trim();
      const useText = text.length >= TEXT_RICH_THRESHOLD;
      const hasImage = artifact?.hasImage ?? false;
      const imageUrl = hasImage
        ? await getPageImageSignedUrl(importId, pageNumber)
        : null;

      return {
        text,
        annotationUrls: artifact?.annotationUrls ?? [],
        imageUrl,
        useText,
        hasImage,
      };
    });

    const { text: usableText, annotationUrls, imageUrl, useText, hasImage } =
      pageData;

    // Structure text via AI with a deterministic fallback when the call
    // fails (e.g. OpenAI quota). The row still saves so the user can
    // re-run enrichment later.
    const draft = await step.run(
      "structure-text",
      async (): Promise<BusinessCardDraft> => {
        if (!useText) {
          return {
            name: null,
            title: null,
            company: null,
            emails: [],
            phones: [],
            websites: annotationUrls.filter((u) => u.startsWith("http")),
            address: null,
            raw_text: usableText,
            confidence: 0.3,
            notes: "Insufficient text layer",
          };
        }
        try {
          return await structureCardFromText(usableText, annotationUrls);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(
            `[extract-page] structure failed for ${importId} p${pageNumber}: ${message}`
          );
          return {
            name: null,
            title: null,
            company: null,
            emails: [],
            phones: [],
            websites: annotationUrls.filter((u) => u.startsWith("http")),
            address: null,
            raw_text: usableText,
            confidence: 0.2,
            notes: `AI structure failed: ${message}`,
          };
        }
      }
    );

    // Decide whether vision verification is worth a second API call:
    //   - if we never rendered a PNG, we can't run vision at all
    //   - if the text-only draft is already high confidence, skip it
    //   - otherwise (sparse text or low-confidence draft), verify
    const visionAvailable = hasImage && imageUrl !== null;
    const needsVision =
      visionAvailable &&
      (!useText || (draft.confidence ?? 0) < SKIP_VISION_CONFIDENCE);

    const verified = needsVision
      ? await step.run(
          "verify-vision",
          async (): Promise<VerifiedCard | null> => {
            try {
              return await verifyCardAgainstImage(draft, imageUrl!);
            } catch (err) {
              const message =
                err instanceof Error ? err.message : String(err);
              console.warn(
                `[extract-page] verify failed for ${importId} p${pageNumber}: ${message}`
              );
              return null;
            }
          }
        )
      : null;

    // Build a verified-shaped object from the draft when vision was
    // skipped or failed. Lets the flatten + save logic work uniformly.
    const fieldFromDraft = (value: string | null) => ({
      value,
      confidence: draft.confidence,
      source: "text_layer" as const,
      unreadable: false,
    });
    const listFromDraft = (values: string[] | undefined) =>
      (values ?? []).map((v) => ({
        value: v,
        confidence: draft.confidence,
        source: "text_layer" as const,
        unreadable: false,
      }));

    const verifiedOrDraft: VerifiedCard = verified ?? {
      name: fieldFromDraft(draft.name),
      title: fieldFromDraft(draft.title),
      company: fieldFromDraft(draft.company),
      emails: listFromDraft(draft.emails),
      phones: listFromDraft(draft.phones),
      websites: listFromDraft(draft.websites),
      address: fieldFromDraft(draft.address),
      overall_confidence: draft.confidence,
      issues: needsVision
        ? [
            {
              field: "_pipeline",
              severity: "warning",
              message: `vision_failed${draft.notes ? `: ${draft.notes}` : ""}`,
            },
          ]
        : [],
    };

    const flat = flattenVerifiedCard(verifiedOrDraft);
    const email = normalizeEmail(flat.email);
    const phone = normalizePhone(flat.phone);
    const website = normalizeWebsite(flat.website);
    const logoUrl = logoFromWebsite(website);

    const fullName = flat.name?.trim() || null;
    const parts = fullName ? fullName.split(/\s+/) : [];
    const firstName = parts.length > 0 ? parts[0] : null;
    const lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;

    let extractionMethod: string;
    if (!useText) {
      extractionMethod = "vision";
    } else if (verified) {
      extractionMethod = "text+vision";
    } else if (needsVision) {
      extractionMethod = "text_only";
    } else {
      extractionMethod = "text";
    }

    const extractedLeadId = await step.run("save-extracted", async () => {
      const [inserted] = await db
        .insert(extractedLeads)
        .values({
          importId,
          pageNumber,
          cardImageUrl: imageUrl,
          rawText: usableText,
          rawJson: verifiedOrDraft,
          name: flat.name,
          displayName: flat.name,
          firstName,
          lastName,
          title: flat.title,
          company: flat.company,
          email,
          phone,
          website,
          address: flat.address,
          logoUrl,
          confidence: String(flat.confidence),
          fieldConfidence: flat.fieldConfidence,
          issues: flat.issues,
          extractionMethod,
          verificationModel: MODEL,
          reviewStatus: "pending",
          enrichmentStatus: "pending",
        })
        .returning({ id: extractedLeads.id });

      await db
        .update(imports)
        .set({
          processedItems: sql`${imports.processedItems} + 1`,
        })
        .where(eq(imports.id, importId));

      const [imp] = await db
        .select()
        .from(imports)
        .where(eq(imports.id, importId));

      if (
        imp &&
        imp.processedItems >= imp.totalItems &&
        imp.totalItems > 0
      ) {
        await db
          .update(imports)
          .set({ status: "ready_for_review" })
          .where(eq(imports.id, importId));
      }

      return inserted.id;
    });

    await step.sendEvent("enrich", {
      name: "lead/enrich.requested",
      data: { extractedLeadId },
    });

    return {
      extractedLeadId,
      pageNumber,
      extractionMethod,
      visionVerified: verified !== null,
    };
  }
);
