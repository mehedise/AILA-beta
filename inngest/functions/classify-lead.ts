import { inArray, sql } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db/client";
import { extractedLeads, imports } from "@/lib/db/schema";
import { classifyIndustries } from "@/lib/ai/classify";
import { gicsToDbFields } from "@/lib/taxonomy/gics-fields";
import { shouldSkipGicsClassification } from "@/lib/taxonomy/classify-guard";
import { markImportReadyWhenPostProcessingDone } from "@/lib/imports/finalize";

function classificationJson(status: "classified" | "failed", error?: string) {
  return {
    classification: {
      attempted: true,
      status,
      error: error ?? null,
    },
  };
}

async function finalizeImports(importIds: string[]) {
  await Promise.all(
    Array.from(new Set(importIds)).map((importId) =>
      markImportReadyWhenPostProcessingDone(importId)
    )
  );
}

export const classifyLead = inngest.createFunction(
  {
    id: "classify-lead",
    retries: 3,
    // Batch up to 20 leads per OpenAI call, waiting at most 5s for more
    // events. This amortizes the large GICS candidate prompt across many
    // leads — biggest single cost driver per import.
    batchEvents: { maxSize: 20, timeout: "5s" },
    triggers: [{ event: "lead/classify.requested" }],
  },
  async ({ events, step }) => {
    const ids = events
      .map((e) => (e.data as { extractedLeadId?: string })?.extractedLeadId)
      .filter((x): x is string => typeof x === "string" && x.length > 0);

    if (ids.length === 0) {
      return { skipped: true, reason: "no_ids_in_batch" };
    }

    const joined = await step.run("fetch-leads", async () => {
      const leadRows = await db
        .select()
        .from(extractedLeads)
        .where(inArray(extractedLeads.id, ids));

      if (leadRows.length === 0) return [];

      const importIds = Array.from(new Set(leadRows.map((r) => r.importId)));
      const importRows = await db
        .select()
        .from(imports)
        .where(inArray(imports.id, importIds));
      const importById = new Map(importRows.map((i) => [i.id, i] as const));

      return leadRows.flatMap((lead) => {
        const importRow = importById.get(lead.importId);
        return importRow ? [{ lead, importRow }] : [];
      });
    });

    const classifiable = joined.filter(
      ({ lead, importRow }) =>
        importRow.status !== "terminated" &&
        !shouldSkipGicsClassification(lead, importRow.createdAt).skip
    );

    if (classifiable.length === 0) {
      await step.run("finalize-if-complete", async () => {
        await finalizeImports(joined.map(({ lead }) => lead.importId));
      });
      return { processed: 0, skipped: joined.length, reason: "all_filtered" };
    }

    let results;
    try {
      results = await step.run("classify-batch", () =>
        classifyIndustries(
          classifiable.map(({ lead }) => ({
            id: lead.id,
            company: lead.company,
            website: lead.website,
            title: lead.title,
            raw_text: lead.rawText,
          }))
        )
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await step.run("mark-classification-failed", async () => {
        await db
          .update(extractedLeads)
          .set({
            enrichmentJson: sql`coalesce(${extractedLeads.enrichmentJson}, '{}'::jsonb) || ${JSON.stringify(
              classificationJson("failed", message)
            )}::jsonb`,
          })
          .where(inArray(extractedLeads.id, classifiable.map(({ lead }) => lead.id)));
      });
      await step.run("finalize-after-failed-classification", async () => {
        await finalizeImports(classifiable.map(({ lead }) => lead.importId));
      });
      return {
        processed: 0,
        failed: classifiable.length,
        error: message,
      };
    }

    await step.run("save-classifications", async () => {
      await Promise.all(
        results.map((result) =>
          db
            .update(extractedLeads)
            .set({
              ...gicsToDbFields(result.gics),
              confidence: String(result.confidence),
              enrichmentJson: sql`coalesce(${extractedLeads.enrichmentJson}, '{}'::jsonb) || ${JSON.stringify(
                classificationJson("classified")
              )}::jsonb`,
            })
            .where(inArray(extractedLeads.id, [result.id]))
        )
      );
    });

    await step.run("finalize-if-complete", async () => {
      await finalizeImports(classifiable.map(({ lead }) => lead.importId));
    });

    return {
      processed: results.length,
      skipped: joined.length - results.length,
    };
  }
);
