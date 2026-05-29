import { auth } from "@clerk/nextjs/server";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { extractedLeads, imports } from "@/lib/db/schema";
import {
  estimateImportAiCost,
  formatUsd,
} from "@/lib/imports/ai-budget";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const [imp] = await db
    .select()
    .from(imports)
    .where(eq(imports.id, id));

  if (!imp) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const pending = await db
    .select({ id: extractedLeads.id })
    .from(extractedLeads)
    .where(
      and(
        eq(extractedLeads.importId, id),
        inArray(extractedLeads.enrichmentStatus, ["pending", "failed"])
      )
    );

  const estimate = estimateImportAiCost({
    leadCount: pending.length,
    includeEnrichment: true,
    includeClassification: true,
  });

  return NextResponse.json({
    pendingCount: pending.length,
    estimate,
    formattedTotal: formatUsd(estimate.totalUsd),
  });
}
