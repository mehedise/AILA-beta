import { eq } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db/client";
import { imports } from "@/lib/db/schema";
import { downloadPdfFromR2, getPdfPageCount } from "@/lib/pdf/load";
import { prerenderPdfChunk } from "@/lib/pdf/prerender";

/**
 * Number of pages prerendered per Inngest step. Each chunk opens the PDF
 * with pdfjs exactly once, so larger chunks amortize the pdfjs init cost
 * but increase per-step duration. 10 keeps step duration under ~30s for
 * typical contact-list PDFs.
 */
const PRERENDER_CHUNK_SIZE = 10;

export const processPdf = inngest.createFunction(
  {
    id: "process-pdf",
    retries: 3,
    triggers: [{ event: "import/uploaded" }],
  },
  async ({ event, step }) => {
    const { importId, fileKey, sourceType } = event.data as {
      importId: string;
      fileKey: string;
      sourceType: string;
    };

    if (sourceType !== "pdf") return { skipped: true };

    await step.run("mark-processing", async () => {
      await db
        .update(imports)
        .set({ status: "processing" })
        .where(eq(imports.id, importId));
    });

    try {
      const pageCount = await step.run("count-pages", async () => {
        const buf = await downloadPdfFromR2(fileKey);
        const count = await getPdfPageCount(buf);
        await db
          .update(imports)
          .set({ totalItems: count, processedItems: 0 })
          .where(eq(imports.id, importId));
        return count;
      });

      if (pageCount === 0) {
        await db
          .update(imports)
          .set({ status: "ready_for_review" })
          .where(eq(imports.id, importId));
        return { importId, pages: 0 };
      }

      // Pre-render every page once. Each chunk opens the source PDF a
      // single time (one R2 download + one pdfjs init) and writes per-page
      // text JSON + (when needed) a trimmed PNG to R2 under
      // `imports/{importId}/pages/{n}.{json,png}`. After this, extract-page
      // never touches the source PDF again.
      for (let start = 1; start <= pageCount; start += PRERENDER_CHUNK_SIZE) {
        const end = Math.min(start + PRERENDER_CHUNK_SIZE - 1, pageCount);
        await step.run(`prerender-${start}-${end}`, async () => {
          const buf = await downloadPdfFromR2(fileKey);
          return prerenderPdfChunk(buf, importId, start, end);
        });
      }

      await step.sendEvent(
        "fan-out-pages",
        Array.from({ length: pageCount }, (_, i) => ({
          name: "import/pdf.page.extract" as const,
          data: {
            importId,
            fileKey,
            pageNumber: i + 1,
          },
        }))
      );

      return { importId, pages: pageCount };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await db
        .update(imports)
        .set({ status: "failed", error: message })
        .where(eq(imports.id, importId));
      throw err;
    }
  }
);
