import { and, count, eq } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db/client";
import { extractedLeads, imports } from "@/lib/db/schema";
import { enrichLead, mergeEnrichment } from "@/lib/ai/enrich";
import { logoFromWebsite, normalizeWebsite } from "@/lib/excel/normalize";

async function markImportReadyWhenEnrichmentDone(importId: string) {
  const [pendingRow] = await db
    .select({ pending: count() })
    .from(extractedLeads)
    .where(
      and(
        eq(extractedLeads.importId, importId),
        eq(extractedLeads.enrichmentStatus, "pending")
      )
    );

  if (Number(pendingRow?.pending ?? 0) > 0) return;

  await db
    .update(imports)
    .set({ status: "ready_for_review" })
    .where(and(eq(imports.id, importId), eq(imports.status, "enriching")));
}

export const enrichLeadFn = inngest.createFunction(
  {
    id: "enrich-lead",
    retries: 3,
    concurrency: { limit: 8 },
    triggers: [{ event: "lead/enrich.requested" }],
  },
  async ({ event, step }) => {
    const { extractedLeadId } = event.data as { extractedLeadId: string };

    const lead = await step.run("fetch-lead", async () => {
      const [row] = await db
        .select()
        .from(extractedLeads)
        .where(eq(extractedLeads.id, extractedLeadId));
      if (!row) throw new Error(`Lead not found: ${extractedLeadId}`);
      return row;
    });

    const terminated = await step.run("check-import", async () => {
      const [imp] = await db
        .select({ status: imports.status })
        .from(imports)
        .where(eq(imports.id, lead.importId));
      return imp?.status === "terminated";
    });

    if (terminated) {
      return { extractedLeadId, skipped: true, reason: "terminated" };
    }

    if (lead.enrichmentStatus === "enriched") {
      await step.run("finalize-if-complete", () =>
        markImportReadyWhenEnrichmentDone(lead.importId)
      );
      await step.sendEvent("classify", {
        name: "lead/classify.requested",
        data: { extractedLeadId },
      });
      return { extractedLeadId, skipped: true, reason: "already_enriched" };
    }

    const input = {
      displayName: lead.displayName ?? lead.name ?? null,
      firstName: lead.firstName,
      lastName: lead.lastName,
      title: lead.title,
      company: lead.company,
      email: lead.email,
      phone: lead.phone,
      mobile: lead.mobile,
      website: lead.website,
      address: lead.address,
      city: lead.city,
      zipCode: lead.zipCode,
      country: lead.country,
      annualRevenue: lead.annualRevenue,
      employeeHeadcount: lead.employeeHeadcount,
    };

    let result;
    try {
      result = await step.run("enrich-call", () => enrichLead(input));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(
        `[enrich-lead] ${extractedLeadId} failed: ${message}`,
        err
      );
      await step.run("mark-failed", async () => {
        await db
          .update(extractedLeads)
          .set({
            enrichmentStatus: "failed",
            enrichmentJson: { error: message },
          })
          .where(eq(extractedLeads.id, extractedLeadId));
      });
      await step.run("finalize-after-failed", () =>
        markImportReadyWhenEnrichmentDone(lead.importId)
      );
      // continue to classify anyway so the lead still gets a sector
      await step.sendEvent("classify", {
        name: "lead/classify.requested",
        data: { extractedLeadId },
      });
      return { extractedLeadId, enriched: false, error: message };
    }

    const merged = mergeEnrichment(input, result.enrichment);

    const saved = await step.run("save-enrichment", async () => {
      const [imp] = await db
        .select({ status: imports.status })
        .from(imports)
        .where(eq(imports.id, lead.importId));
      if (imp?.status === "terminated") return false;

      const website = merged.website
        ? normalizeWebsite(merged.website)
        : lead.website;
      const logoUrl = lead.logoUrl ?? logoFromWebsite(website);

      const displayName =
        merged.displayName ?? lead.displayName ?? lead.name ?? null;

      const composedName =
        displayName ||
        [
          merged.firstName ?? lead.firstName,
          merged.lastName ?? lead.lastName,
        ]
          .filter(Boolean)
          .join(" ")
          .trim() ||
        null;

      await db
        .update(extractedLeads)
        .set({
          ...merged,
          website,
          logoUrl,
          displayName,
          name: composedName ?? lead.name,
          enrichmentStatus: "enriched",
          enrichmentJson: {
            mode: result.mode,
            fieldSources: result.enrichment.fieldSources,
            notes: result.enrichment.notes,
          },
        })
        .where(eq(extractedLeads.id, extractedLeadId));
      return true;
    });

    if (!saved) {
      return { extractedLeadId, skipped: true, reason: "terminated" };
    }

    await step.run("finalize-after-enriched", () =>
      markImportReadyWhenEnrichmentDone(lead.importId)
    );

    await step.sendEvent("classify", {
      name: "lead/classify.requested",
      data: { extractedLeadId },
    });

    return {
      extractedLeadId,
      enriched: true,
      mode: result.mode,
      filled: Object.keys(merged),
    };
  }
);
