import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { processXlsx } from "@/inngest/functions/process-xlsx";
import { processPdf } from "@/inngest/functions/process-pdf";
import { extractPage } from "@/inngest/functions/extract-page";
import { enrichLeadFn } from "@/inngest/functions/enrich-lead";
import { classifyLead } from "@/inngest/functions/classify-lead";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processXlsx, processPdf, extractPage, enrichLeadFn, classifyLead],
});
