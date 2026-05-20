import { eq } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db/client";
import { imports } from "@/lib/db/schema";
import { getImportSettings } from "@/lib/imports/get-settings";
import { createPageJobRanges } from "@/lib/imports/page-jobs";
import {
  countAndInitLargeImport,
  isImportTerminated,
  LARGE_PRERENDER_CHUNK,
  prerenderLargeChunk,
} from "@/lib/pdf/process-large";

export const processPdfLarge = inngest.createFunction(
  {
    id: "process-pdf-large",
    retries: 2,
    triggers: [{ event: "import/uploaded.large" }],
  },
  async ({ event, step }) => {
    const { importId, fileKey, sourceType } = event.data as {
      importId: string;
      fileKey: string;
      sourceType: string;
    };

    if (sourceType !== "pdf") return { skipped: true };

    await step.run("mark-processing", async () => {
      if (await isImportTerminated(importId)) return;
      await db
        .update(imports)
        .set({ status: "processing" })
        .where(eq(imports.id, importId));
    });

    if (await step.run("check-terminated", () => isImportTerminated(importId))) {
      return { importId, skipped: true, reason: "terminated" };
    }

    try {
      const pageCount = await step.run("count-pages", async () => {
        if (await isImportTerminated(importId)) return 0;
        return countAndInitLargeImport(importId, fileKey);
      });

      if (pageCount === 0) {
        await db
          .update(imports)
          .set({ status: "ready_for_review" })
          .where(eq(imports.id, importId));
        return { importId, pages: 0 };
      }

      for (let start = 1; start <= pageCount; start += LARGE_PRERENDER_CHUNK) {
        const end = Math.min(start + LARGE_PRERENDER_CHUNK - 1, pageCount);
        await step.run(`prerender-${start}-${end}`, async () => {
          if (await isImportTerminated(importId)) return [];
          return prerenderLargeChunk(importId, fileKey, start, end);
        });
      }

      const impRows = await step.run("load-settings", async () =>
        db.select().from(imports).where(eq(imports.id, importId))
      );

      const imp = impRows[0];
      const settings = imp ? getImportSettings(imp) : { batchSize: 100 };
      const batchSize = settings.batchSize ?? 100;

      const jobs = await step.run("create-extract-jobs", async () => {
        if (await isImportTerminated(importId)) return [];
        await db
          .update(imports)
          .set({ status: "extracting" })
          .where(eq(imports.id, importId));
        return createPageJobRanges(importId, pageCount, batchSize);
      });

      if (await step.run("check-before-fanout", () => isImportTerminated(importId))) {
        return { importId, skipped: true, reason: "terminated" };
      }

      await step.sendEvent(
        "fan-out-batches",
        jobs.map((job) => ({
          name: "import/pdf.page.extract.batch" as const,
          data: {
            importId,
            fileKey,
            jobId: job.id,
            startPage: job.startPage,
            endPage: job.endPage,
          },
        }))
      );

      return { importId, pages: pageCount, batches: jobs.length };
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
