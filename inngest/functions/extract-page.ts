import { inngest } from "@/lib/inngest/client";
import {
  extractSinglePage,
  getImportEnrichPolicy,
  isImportTerminated,
} from "@/lib/pdf/extract-page-core";

export const extractPage = inngest.createFunction(
  {
    id: "extract-page",
    concurrency: { limit: 5 },
    retries: 1,
    triggers: [{ event: "import/pdf.page.extract" }],
  },
  async ({ event, step }) => {
    const { importId, fileKey, pageNumber, autoEnrich } = event.data as {
      importId: string;
      fileKey: string;
      pageNumber: number;
      autoEnrich?: boolean;
    };

    if (await step.run("check-terminated", () => isImportTerminated(importId))) {
      return { importId, pageNumber, skipped: true, reason: "terminated" };
    }

    const policy = await step.run("load-policy", () =>
      getImportEnrichPolicy(importId)
    );

    const shouldEnrich = autoEnrich ?? policy.autoEnrich;

    const result = await step.run("extract", () =>
      extractSinglePage({
        importId,
        fileKey,
        pageNumber,
        autoEnrich: shouldEnrich,
        visionForLowConfidenceOnly: policy.visionForLowConfidenceOnly,
      })
    );

    if (!result.extractedLeadId || result.skipped) {
      return { importId, pageNumber, skipped: true, reason: "terminated" };
    }

    if (shouldEnrich) {
      await step.sendEvent("enrich", {
        name: "lead/enrich.requested",
        data: { extractedLeadId: result.extractedLeadId },
      });
    } else if (policy.autoClassify) {
      await step.sendEvent("classify", {
        name: "lead/classify.requested",
        data: { extractedLeadId: result.extractedLeadId },
      });
    }

    return {
      extractedLeadId: result.extractedLeadId,
      pageNumber,
    };
  }
);
