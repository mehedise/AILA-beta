import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  lt,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/lib/db/client";
import { extractedLeads } from "@/lib/db/schema";
import type { PageParams } from "@/lib/api/pagination";

const EXTRACTED_SORT_COLUMNS = {
  pageNumber: extractedLeads.pageNumber,
  displayName: extractedLeads.displayName,
  name: extractedLeads.name,
  company: extractedLeads.company,
  email: extractedLeads.email,
  confidence: extractedLeads.confidence,
  reviewStatus: extractedLeads.reviewStatus,
  enrichmentStatus: extractedLeads.enrichmentStatus,
  createdAt: extractedLeads.createdAt,
} as const;

export type ExtractedLeadFilters = {
  reviewStatus?: string;
  excludeRejected?: boolean;
  enrichmentStatus?: string;
  lowConfidenceOnly?: boolean;
  q?: string;
};

export function buildExtractedLeadConditions(
  importId: string,
  filters: ExtractedLeadFilters
): SQL[] {
  const conditions: SQL[] = [eq(extractedLeads.importId, importId)];

  if (filters.reviewStatus && filters.reviewStatus !== "all") {
    conditions.push(
      eq(
        extractedLeads.reviewStatus,
        filters.reviewStatus as "pending" | "approved" | "rejected"
      )
    );
  } else if (filters.excludeRejected) {
    conditions.push(ne(extractedLeads.reviewStatus, "rejected"));
  }

  if (filters.enrichmentStatus && filters.enrichmentStatus !== "all") {
    conditions.push(
      eq(
        extractedLeads.enrichmentStatus,
        filters.enrichmentStatus as "pending" | "enriched" | "failed" | "skipped"
      )
    );
  }

  if (filters.lowConfidenceOnly) {
    conditions.push(
      lt(sql`COALESCE(${extractedLeads.confidence}::float, 0)`, 0.6)
    );
  }

  if (filters.q?.trim()) {
    const like = `%${filters.q.trim()}%`;
    conditions.push(
      or(
        ilike(extractedLeads.displayName, like),
        ilike(extractedLeads.name, like),
        ilike(extractedLeads.company, like),
        ilike(extractedLeads.email, like),
        ilike(extractedLeads.phone, like)
      )!
    );
  }

  return conditions;
}

export async function countExtractedLeads(
  importId: string,
  filters: ExtractedLeadFilters
) {
  const conditions = buildExtractedLeadConditions(importId, filters);
  const [row] = await db
    .select({ total: count() })
    .from(extractedLeads)
    .where(and(...conditions));
  return Number(row?.total ?? 0);
}

export async function listExtractedLeads(
  importId: string,
  filters: ExtractedLeadFilters,
  page: PageParams,
  sort?: { sortBy: string | null; sortDir: "asc" | "desc" }
) {
  const conditions = buildExtractedLeadConditions(importId, filters);
  const sortCol =
    sort?.sortBy &&
    sort.sortBy in EXTRACTED_SORT_COLUMNS
      ? EXTRACTED_SORT_COLUMNS[
          sort.sortBy as keyof typeof EXTRACTED_SORT_COLUMNS
        ]
      : extractedLeads.pageNumber;
  const order =
    sort?.sortDir === "desc" ? desc(sortCol) : asc(sortCol);

  return db
    .select()
    .from(extractedLeads)
    .where(and(...conditions))
    .orderBy(order, asc(extractedLeads.id))
    .limit(page.limit)
    .offset(page.offset);
}

export async function listExtractedLeadIds(
  importId: string,
  filters: ExtractedLeadFilters
) {
  const conditions = buildExtractedLeadConditions(importId, filters);
  return db
    .select({ id: extractedLeads.id })
    .from(extractedLeads)
    .where(and(...conditions))
    .orderBy(asc(extractedLeads.pageNumber), asc(extractedLeads.id));
}

export async function getExtractedLeadStats(importId: string) {
  const rows = await db
    .select({
      reviewStatus: extractedLeads.reviewStatus,
      enrichmentStatus: extractedLeads.enrichmentStatus,
      total: count(),
    })
    .from(extractedLeads)
    .where(eq(extractedLeads.importId, importId))
    .groupBy(extractedLeads.reviewStatus, extractedLeads.enrichmentStatus);

  let pending = 0;
  let approved = 0;
  let rejected = 0;
  let enrichmentPending = 0;
  let enrichmentDone = 0;
  let total = 0;

  for (const row of rows) {
    const n = Number(row.total);
    total += n;
    if (row.reviewStatus === "pending") pending += n;
    if (row.reviewStatus === "approved") approved += n;
    if (row.reviewStatus === "rejected") rejected += n;
    if (row.enrichmentStatus === "pending") enrichmentPending += n;
    if (
      row.enrichmentStatus === "enriched" ||
      row.enrichmentStatus === "failed" ||
      row.enrichmentStatus === "skipped"
    ) {
      enrichmentDone += n;
    }
  }

  const [classifiedRow] = await db
    .select({ classified: count() })
    .from(extractedLeads)
    .where(
      and(
        eq(extractedLeads.importId, importId),
        sql`${extractedLeads.gicsClassificationKey} is not null and ${extractedLeads.gicsClassificationKey} <> ''`
      )
    );

  return {
    total,
    pending,
    approved,
    rejected,
    classified: Number(classifiedRow?.classified ?? 0),
    enrichmentTotal: total,
    enrichmentPending,
    enrichmentDone,
    lowConfidence: await countExtractedLeads(importId, {
      lowConfidenceOnly: true,
    }),
  };
}

export async function getMissingPageNumbers(
  importId: string,
  totalPages: number
): Promise<number[]> {
  if (totalPages <= 0) return [];
  const rows = await db
    .select({ pageNumber: extractedLeads.pageNumber })
    .from(extractedLeads)
    .where(eq(extractedLeads.importId, importId));
  const existing = new Set(
    rows.map((r) => r.pageNumber).filter((n): n is number => n != null)
  );
  const missing: number[] = [];
  for (let p = 1; p <= totalPages; p += 1) {
    if (!existing.has(p)) missing.push(p);
  }
  return missing;
}
