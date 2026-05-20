import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  buildPageInfo,
  parsePageParams,
  parseSortParams,
} from "@/lib/api/pagination";
import { db } from "@/lib/db/client";
import { imports } from "@/lib/db/schema";
import {
  countExtractedLeads,
  listExtractedLeadIds,
  listExtractedLeads,
  type ExtractedLeadFilters,
} from "@/lib/db/queries/extracted-leads";

const SORTABLE = [
  "pageNumber",
  "displayName",
  "name",
  "company",
  "email",
  "confidence",
  "reviewStatus",
  "enrichmentStatus",
  "createdAt",
] as const;

export async function GET(
  req: Request,
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
    .where(and(eq(imports.id, id), eq(imports.userId, userId)));

  if (!imp) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const page = parsePageParams(searchParams);
  const sort = parseSortParams(searchParams, SORTABLE, {
    by: "pageNumber",
    dir: "asc",
  });

  const filters: ExtractedLeadFilters = {
    q: searchParams.get("q") ?? undefined,
    reviewStatus: searchParams.get("reviewStatus") ?? undefined,
    excludeRejected: searchParams.get("excludeRejected") === "true",
    enrichmentStatus: searchParams.get("enrichmentStatus") ?? undefined,
    lowConfidenceOnly: searchParams.get("lowConfidenceOnly") === "true",
  };

  if (searchParams.get("idsOnly") === "true") {
    const rows = await listExtractedLeadIds(id, filters);
    return NextResponse.json({ ids: rows.map((row) => row.id) });
  }

  const [totalCount, rows] = await Promise.all([
    countExtractedLeads(id, filters),
    listExtractedLeads(id, filters, page, sort),
  ]);

  return NextResponse.json({
    leads: rows,
    pageInfo: buildPageInfo(totalCount, page),
  });
}
