import { auth } from "@clerk/nextjs/server";
import { desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { resolveUserLabels } from "@/lib/auth/clerk-users";
import { db } from "@/lib/db/client";
import { extractedLeads, imports } from "@/lib/db/schema";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(imports)
    .orderBy(desc(imports.createdAt));

  const statsRows = await db
    .select({
      importId: extractedLeads.importId,
      approvedLeadCount: sql<number>`count(*) filter (where ${extractedLeads.reviewStatus} = 'approved')`,
      unclassifiedLeadCount: sql<number>`count(*) filter (
        where ${extractedLeads.gicsClassificationKey} is null
          or ${extractedLeads.gicsClassificationKey} = ''
      )`,
    })
    .from(extractedLeads)
    .innerJoin(imports, eq(extractedLeads.importId, imports.id))
    .groupBy(extractedLeads.importId);

  const statsByImport = new Map(
    statsRows.map((row) => [
      row.importId,
      {
        approvedLeadCount: Number(row.approvedLeadCount ?? 0),
        unclassifiedLeadCount: Number(row.unclassifiedLeadCount ?? 0),
      },
    ])
  );

  const uploadedByLabels = await resolveUserLabels(rows.map((row) => row.userId));

  return NextResponse.json({
    imports: rows.map((row) => ({
      ...row,
      uploadedByLabel: uploadedByLabels.get(row.userId) ?? row.userId,
      approvedLeadCount: statsByImport.get(row.id)?.approvedLeadCount ?? 0,
      unclassifiedLeadCount:
        statsByImport.get(row.id)?.unclassifiedLeadCount ?? 0,
    })),
  });
}
