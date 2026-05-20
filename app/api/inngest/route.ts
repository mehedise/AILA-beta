import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { processXlsx } from "@/inngest/functions/process-xlsx";
import { processPdf } from "@/inngest/functions/process-pdf";
import { processPdfLarge } from "@/inngest/functions/process-pdf-large";
import { extractPage } from "@/inngest/functions/extract-page";
import { extractPageBatch } from "@/inngest/functions/extract-page-batch";
import { enrichLeadFn } from "@/inngest/functions/enrich-lead";
import { classifyLead } from "@/inngest/functions/classify-lead";
import {
  bulkApproveImport,
  bulkEnrichImport,
  bulkExportImport,
} from "@/inngest/functions/bulk-import-jobs";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processXlsx,
    processPdf,
    processPdfLarge,
    extractPage,
    extractPageBatch,
    enrichLeadFn,
    classifyLead,
    bulkApproveImport,
    bulkEnrichImport,
    bulkExportImport,
  ],
});
