import { eq, sql } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db/client";
import { imports } from "@/lib/db/schema";
import { markPageJobStatus } from "@/lib/imports/page-jobs";
import {
  extractSinglePage,
  getImportEnrichPolicy,
  isImportTerminated,
} from "@/lib/pdf/extract-page-core";

export const extractPageBatch = inngest.createFunction(
  {
    id: "extract-page-batch",
    concurrency: { limit: 4, key: "event.data.importId" },
    retries: 1,
    triggers: [{ event: "import/pdf.page.extract.batch" }],
  },
  async ({ event, step }) => {
    const { importId, fileKey, jobId, startPage, endPage } = event.data as {
      importId: string;
      fileKey: string;
      jobId: string;
      startPage: number;
      endPage: number;
    };

    if (await step.run("check-terminated", () => isImportTerminated(importId))) {
      return { importId, skipped: true, reason: "terminated" };
    }

    await step.run("mark-running", () => markPageJobStatus(jobId, "running"));

    const policy = await step.run("load-policy", () =>
      getImportEnrichPolicy(importId)
    );

    const results = await step.run("extract-range", async () => {
      const extractedIds: string[] = [];
      let failures = 0;

      for (let pageNumber = startPage; pageNumber <= endPage; pageNumber += 1) {
        if (await isImportTerminated(importId)) break;
        try {
          const result = await extractSinglePage({
            importId,
            fileKey,
            pageNumber,
            autoEnrich: policy.autoEnrich,
            visionForLowConfidenceOnly: policy.visionForLowConfidenceOnly,
          });
          if (result.extractedLeadId) extractedIds.push(result.extractedLeadId);
        } catch (err) {
          failures += 1;
          console.error(
            `[extract-page-batch] ${importId} p${pageNumber}:`,
            err
          );
          await db
            .update(imports)
            .set({
              extractionFailures: sql`${imports.extractionFailures} + 1`,
            })
            .where(eq(imports.id, importId));
        }
      }

      return { extractedIds, failures };
    });

    if (results.failures > 0) {
      await step.run("mark-failed", () =>
        markPageJobStatus(jobId, "failed", `${results.failures} page(s) failed`)
      );
    } else {
      await step.run("mark-completed", () =>
        markPageJobStatus(jobId, "completed")
      );
    }

    if (results.extractedIds.length > 0) {
      if (policy.autoEnrich) {
        await step.sendEvent(
          "enrich-batch",
          results.extractedIds.map((extractedLeadId) => ({
            name: "lead/enrich.requested" as const,
            data: { extractedLeadId },
          }))
        );
      } else if (policy.autoClassify) {
        await step.sendEvent(
          "classify-batch",
          results.extractedIds.map((extractedLeadId) => ({
            name: "lead/classify.requested" as const,
            data: { extractedLeadId },
          }))
        );
      }
    }

    return {
      importId,
      jobId,
      startPage,
      endPage,
      extracted: results.extractedIds.length,
      failures: results.failures,
    };
  }
);
