import { eq, sql } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db/client";
import { extractedLeads, imports } from "@/lib/db/schema";
import { downloadPdfFromR2 } from "@/lib/pdf/load";
import { extractPageText } from "@/lib/pdf/extract-text";
import { rasterizePageToR2 } from "@/lib/pdf/rasterize";
import { structureCardFromText } from "@/lib/ai/structure-text";
import { verifyCardAgainstImage } from "@/lib/ai/verify-card";
import { flattenVerifiedCard } from "@/lib/ai/schemas";
import { MODEL } from "@/lib/ai/structure-text";
import {
  normalizeEmail,
  normalizePhone,
  normalizeWebsite,
  logoFromWebsite,
} from "@/lib/excel/normalize";

export const extractPage = inngest.createFunction(
  {
    id: "extract-page",
    concurrency: { limit: 10 },
    retries: 3,
    triggers: [{ event: "import/pdf.page.extract" }],
  },
  async ({ event, step }) => {
    const { importId, fileKey, pageNumber } = event.data as {
      importId: string;
      fileKey: string;
      pageNumber: number;
    };

    const pdfBuffer = await downloadPdfFromR2(fileKey);

    const { text, annotationUrls } = await step.run("text-layer", () =>
      extractPageText(pdfBuffer, pageNumber)
    );

    const imageUrl = await step.run("rasterize", () =>
      rasterizePageToR2(pdfBuffer, importId, pageNumber)
    );

    const usableText = text.replace(/\s+/g, " ").trim();
    const useText = usableText.length >= 30;

    const draft = await step.run("structure-text", async () => {
      if (useText) {
        return structureCardFromText(usableText, annotationUrls);
      }
      return {
        name: null,
        title: null,
        company: null,
        emails: [] as string[],
        phones: [] as string[],
        websites: annotationUrls.filter((u) => u.startsWith("http")),
        address: null,
        raw_text: usableText,
        confidence: 0.3,
        notes: "Insufficient text layer",
      };
    });

    const verified = await step.run("verify-vision", () =>
      verifyCardAgainstImage(draft, imageUrl)
    );

    const flat = flattenVerifiedCard(verified);
    const email = normalizeEmail(flat.email);
    const phone = normalizePhone(flat.phone);
    const website = normalizeWebsite(flat.website);
    const logoUrl = logoFromWebsite(website);

    const fullName = flat.name?.trim() || null;
    const parts = fullName ? fullName.split(/\s+/) : [];
    const firstName = parts.length > 0 ? parts[0] : null;
    const lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;

    const extractedLeadId = await step.run("save-extracted", async () => {
      const [inserted] = await db
        .insert(extractedLeads)
        .values({
          importId,
          pageNumber,
          cardImageUrl: imageUrl,
          rawText: usableText,
          rawJson: verified,
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
          extractionMethod: useText ? "text+vision" : "vision",
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

    return { extractedLeadId, pageNumber };
  }
);
