import { eq } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db/client";
import { imports } from "@/lib/db/schema";
import { getImportSettings } from "@/lib/imports/get-settings";
import { LARGE_PAGE_THRESHOLD } from "@/lib/imports/settings";
import { downloadPdfFromR2, getPdfPageCount } from "@/lib/pdf/load";
import { prerenderPdfChunk } from "@/lib/pdf/prerender";

const PRERENDER_CHUNK_SIZE = 10;

async function isImportTerminated(importId: string): Promise<boolean> {
  const [imp] = await db
    .select({ status: imports.status })
    .from(imports)
    .where(eq(imports.id, importId));
  return imp?.status === "terminated";
}

export const processPdf = inngest.createFunction(
  {
    id: "process-pdf",
    retries: 3,
    triggers: [{ event: "import/uploaded" }],
  },
  async ({ event, step }) => {
    const { importId, fileKey, sourceType, processingMode } = event.data as {
      importId: string;
      fileKey: string;
      sourceType: string;
      processingMode?: string;
    };

    if (sourceType !== "pdf") return { skipped: true };

    const row = await step.run("load-import", async () => {
      const rows = await db
        .select()
        .from(imports)
        .where(eq(imports.id, importId));
      return rows[0] ?? null;
    });
    const settings = row ? getImportSettings(row) : null;
    const useLargePipeline =
      processingMode === "large" ||
      row?.processingMode === "large" ||
      settings?.batchExtraction === true;

    if (useLargePipeline) {
      await step.sendEvent("delegate-large", {
        name: "import/uploaded.large",
        data: { importId, fileKey, sourceType },
      });
      return { importId, delegated: "large" };
    }

    await step.run("mark-processing", async () => {
      if (await isImportTerminated(importId)) return;
      await db
        .update(imports)
        .set({ status: "processing" })
        .where(eq(imports.id, importId));
    });

    if (
      await step.run("check-before-count", () => isImportTerminated(importId))
    ) {
      return { importId, skipped: true, reason: "terminated" };
    }

    try {
      const pageCount = await step.run("count-pages", async () => {
        if (await isImportTerminated(importId)) return 0;
        const buf = await downloadPdfFromR2(fileKey);
        const count = await getPdfPageCount(buf);

        if (count >= LARGE_PAGE_THRESHOLD) {
          await db
            .update(imports)
            .set({
              processingMode: "large",
              importSettings: getImportSettings({
                processingMode: "large",
                importSettings: (row as { importSettings?: unknown } | null)
                  ?.importSettings ?? null,
              }),
            })
            .where(eq(imports.id, importId));
          return -count;
        }

        if (await isImportTerminated(importId)) return count;
        await db
          .update(imports)
          .set({ totalItems: count, processedItems: 0 })
          .where(eq(imports.id, importId));
        return count;
      });

      if (pageCount < 0) {
        await step.sendEvent("delegate-large-after-count", {
          name: "import/uploaded.large",
          data: { importId, fileKey, sourceType },
        });
        return { importId, delegated: "large", pages: Math.abs(pageCount) };
      }

      if (
        await step.run("check-after-count", () => isImportTerminated(importId))
      ) {
        return { importId, skipped: true, reason: "terminated" };
      }

      if (pageCount === 0) {
        await db
          .update(imports)
          .set({ status: "ready_for_review" })
          .where(eq(imports.id, importId));
        return { importId, pages: 0 };
      }

      for (let start = 1; start <= pageCount; start += PRERENDER_CHUNK_SIZE) {
        const end = Math.min(start + PRERENDER_CHUNK_SIZE - 1, pageCount);
        await step.run(`prerender-${start}-${end}`, async () => {
          if (await isImportTerminated(importId)) return [];
          const buf = await downloadPdfFromR2(fileKey);
          if (await isImportTerminated(importId)) return [];
          return prerenderPdfChunk(buf, importId, start, end);
        });
      }

      if (
        await step.run("check-before-fanout", () =>
          isImportTerminated(importId)
        )
      ) {
        return { importId, skipped: true, reason: "terminated" };
      }

      const autoEnrich = settings?.autoEnrich ?? true;

      await step.sendEvent(
        "fan-out-pages",
        Array.from({ length: pageCount }, (_, i) => ({
          name: "import/pdf.page.extract" as const,
          data: {
            importId,
            fileKey,
            pageNumber: i + 1,
            autoEnrich,
          },
        }))
      );

      return { importId, pages: pageCount };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      if (!(await isImportTerminated(importId))) {
        await db
          .update(imports)
          .set({ status: "failed", error: message })
          .where(eq(imports.id, importId));
      }
      throw err;
    }
  }
);
