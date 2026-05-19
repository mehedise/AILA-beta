import { eq } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db/client";
import { imports } from "@/lib/db/schema";
import { downloadPdfFromR2, getPdfPageCount } from "@/lib/pdf/load";

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
