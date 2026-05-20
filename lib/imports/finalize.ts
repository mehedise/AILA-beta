import { and, count, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { extractedLeads, imports } from "@/lib/db/schema";
import { shouldSkipGicsClassification } from "@/lib/taxonomy/classify-guard";

function hasGicsClassification(lead: typeof extractedLeads.$inferSelect) {
  return Boolean(
    lead.gicsClassificationKey ||
      lead.gicsSectorCode ||
      lead.gicsIndustryCode ||
      lead.gicsSubIndustryCode
  );
}

function hasClassificationAttempt(lead: typeof extractedLeads.$inferSelect) {
  const json = lead.enrichmentJson;
  if (!json || typeof json !== "object" || Array.isArray(json)) return false;
  const classification = (json as { classification?: unknown }).classification;
  return (
    typeof classification === "object" &&
    classification !== null &&
    (classification as { attempted?: unknown }).attempted === true
  );
}

export async function markImportReadyWhenPostProcessingDone(importId: string) {
  const [imp] = await db
    .select()
    .from(imports)
    .where(eq(imports.id, importId));

  if (!imp || imp.status !== "enriching") return;

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

  const rows = await db
    .select()
    .from(extractedLeads)
    .where(eq(extractedLeads.importId, importId));

  const hasClassificationPending = rows.some((lead) => {
    if (hasGicsClassification(lead)) return false;
    if (hasClassificationAttempt(lead)) return false;
    return !shouldSkipGicsClassification(lead, imp.createdAt).skip;
  });

  if (hasClassificationPending) return;

  await db
    .update(imports)
    .set({ status: "ready_for_review" })
    .where(and(eq(imports.id, importId), eq(imports.status, "enriching")));
}
