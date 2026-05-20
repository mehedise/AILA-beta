import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/lib/db/client";
import { extractedLeads, imports, leads } from "@/lib/db/schema";
import type { PageParams } from "@/lib/api/pagination";
import {
  getAnnualRevenueRange,
  getHeadcountRange,
  type NumericRange,
} from "@/lib/leads/firmographic-options";

const TEXT_COLUMN_FILTERS = [
  ["displayName", leads.displayName],
  ["firstName", leads.firstName],
  ["lastName", leads.lastName],
  ["name", leads.name],
  ["title", leads.title],
  ["company", leads.company],
  ["email", leads.email],
  ["phone", leads.phone],
  ["mobile", leads.mobile],
  ["website", leads.website],
  ["address", leads.address],
  ["city", leads.city],
  ["zipCode", leads.zipCode],
  ["country", leads.country],
  ["annualRevenue", leads.annualRevenue],
  ["employeeHeadcount", leads.employeeHeadcount],
  ["gicsSubIndustryDescription", leads.gicsSubIndustryDescription],
] as const;

const LEAD_SORT_COLUMNS = {
  displayName: leads.displayName,
  firstName: leads.firstName,
  lastName: leads.lastName,
  title: leads.title,
  company: leads.company,
  email: leads.email,
  phone: leads.phone,
  mobile: leads.mobile,
  website: leads.website,
  address: leads.address,
  city: leads.city,
  zipCode: leads.zipCode,
  country: leads.country,
  annualRevenue: leads.annualRevenue,
  employeeHeadcount: leads.employeeHeadcount,
  gicsSector: leads.gicsSector,
  gicsIndustryGroup: leads.gicsIndustryGroup,
  gicsIndustry: leads.gicsIndustry,
  gicsSubIndustry: leads.gicsSubIndustry,
  gicsSubIndustryDescription: leads.gicsSubIndustryDescription,
  createdAt: leads.createdAt,
} as const;

export type LeadListFilters = {
  q?: string;
  sector?: string;
  industryGroup?: string;
  industry?: string;
  subIndustry?: string;
  columns?: Record<string, string>;
};

/**
 * Coerce the (free-text) `leads.annual_revenue` column to a numeric value so
 * that bucket filters work regardless of how the value was written. Handles
 * common formats like "$2.5M", "5,000,000", "1 billion", or a stored bucket
 * label like "$1M - $10M" (parsed to its lower bound).
 */
const REVENUE_NUMERIC_EXPR = sql`(
  CASE
    WHEN ${leads.annualRevenue} IS NULL OR btrim(${leads.annualRevenue}) = '' THEN NULL
    WHEN replace(${leads.annualRevenue}, ',', '') ~* '[0-9.]+\\s*b' THEN
      nullif(substring(replace(${leads.annualRevenue}, ',', '') from '[0-9]+(?:\\.[0-9]+)?'), '')::numeric * 1000000000
    WHEN replace(${leads.annualRevenue}, ',', '') ~* '[0-9.]+\\s*m' THEN
      nullif(substring(replace(${leads.annualRevenue}, ',', '') from '[0-9]+(?:\\.[0-9]+)?'), '')::numeric * 1000000
    WHEN replace(${leads.annualRevenue}, ',', '') ~* '[0-9.]+\\s*k' THEN
      nullif(substring(replace(${leads.annualRevenue}, ',', '') from '[0-9]+(?:\\.[0-9]+)?'), '')::numeric * 1000
    ELSE
      nullif(substring(replace(${leads.annualRevenue}, ',', '') from '[0-9]+(?:\\.[0-9]+)?'), '')::numeric
  END
)`;

const HEADCOUNT_NUMERIC_EXPR = sql`(
  CASE
    WHEN ${leads.employeeHeadcount} IS NULL OR btrim(${leads.employeeHeadcount}) = '' THEN NULL
    ELSE nullif(substring(replace(${leads.employeeHeadcount}, ',', '') from '[0-9]+'), '')::numeric
  END
)`;

function buildRangeCondition(
  numericExpr: SQL,
  range: NumericRange
): SQL {
  if (range.max === null) {
    return sql`${numericExpr} IS NOT NULL AND ${numericExpr} >= ${range.min}`;
  }
  return sql`${numericExpr} IS NOT NULL AND ${numericExpr} >= ${range.min} AND ${numericExpr} <= ${range.max}`;
}

function annualRevenueBucketCondition(
  label: string,
  range: NumericRange
): SQL {
  return or(
    eq(leads.annualRevenue, label),
    buildRangeCondition(REVENUE_NUMERIC_EXPR, range)
  )!;
}

function employeeHeadcountBucketCondition(
  label: string,
  range: NumericRange
): SQL {
  return or(
    eq(leads.employeeHeadcount, label),
    buildRangeCondition(HEADCOUNT_NUMERIC_EXPR, range)
  )!;
}

export function buildLeadConditions(
  userId: string,
  filters: LeadListFilters
): SQL[] {
  const conditions: SQL[] = [eq(leads.userId, userId)];

  const q = filters.q?.trim();
  if (q) {
    const like = `%${q}%`;
    conditions.push(
      or(
        ilike(leads.displayName, like),
        ilike(leads.firstName, like),
        ilike(leads.lastName, like),
        ilike(leads.name, like),
        ilike(leads.title, like),
        ilike(leads.company, like),
        ilike(leads.email, like),
        ilike(leads.phone, like),
        ilike(leads.mobile, like),
        ilike(leads.website, like),
        ilike(leads.address, like),
        ilike(leads.city, like),
        ilike(leads.zipCode, like),
        ilike(leads.country, like),
        ilike(leads.annualRevenue, like),
        ilike(leads.employeeHeadcount, like),
        ilike(leads.gicsSector, like),
        ilike(leads.gicsIndustryGroup, like),
        ilike(leads.gicsIndustry, like),
        ilike(leads.gicsSubIndustry, like),
        ilike(leads.gicsSubIndustryDescription, like)
      )!
    );
  }

  for (const [key, column] of TEXT_COLUMN_FILTERS) {
    const value = filters.columns?.[key]?.trim();
    if (!value) continue;

    if (key === "annualRevenue") {
      const range = getAnnualRevenueRange(value);
      if (range) {
        conditions.push(annualRevenueBucketCondition(value, range));
        continue;
      }
    }
    if (key === "employeeHeadcount") {
      const range = getHeadcountRange(value);
      if (range) {
        conditions.push(employeeHeadcountBucketCondition(value, range));
        continue;
      }
    }
    conditions.push(ilike(column, `%${value}%`));
  }

  if (filters.sector && filters.sector !== "all") {
    conditions.push(eq(leads.gicsSectorCode, filters.sector));
  }
  if (filters.industryGroup && filters.industryGroup !== "all") {
    conditions.push(eq(leads.gicsIndustryGroupCode, filters.industryGroup));
  }
  if (filters.industry && filters.industry !== "all") {
    conditions.push(eq(leads.gicsIndustryCode, filters.industry));
  }
  if (filters.subIndustry && filters.subIndustry !== "all") {
    conditions.push(eq(leads.gicsSubIndustryCode, filters.subIndustry));
  }

  return conditions;
}

export async function countLeads(userId: string, filters: LeadListFilters) {
  const conditions = buildLeadConditions(userId, filters);
  const [row] = await db
    .select({ total: count() })
    .from(leads)
    .where(and(...conditions));
  return Number(row?.total ?? 0);
}

export async function listLeads(
  userId: string,
  filters: LeadListFilters,
  page: PageParams,
  sort?: { sortBy: string | null; sortDir: "asc" | "desc" }
) {
  const conditions = buildLeadConditions(userId, filters);
  const sortCol =
    sort?.sortBy && sort.sortBy in LEAD_SORT_COLUMNS
      ? LEAD_SORT_COLUMNS[sort.sortBy as keyof typeof LEAD_SORT_COLUMNS]
      : leads.createdAt;
  const order =
    sort?.sortDir === "asc" ? asc(sortCol) : desc(sortCol);

  const rows = await db
    .select({
      lead: leads,
      sourceImportId: extractedLeads.importId,
      sourceImportName: imports.fileName,
    })
    .from(leads)
    .leftJoin(
      extractedLeads,
      eq(leads.sourceExtractedLeadId, extractedLeads.id)
    )
    .leftJoin(imports, eq(extractedLeads.importId, imports.id))
    .where(and(...conditions))
    .orderBy(order, desc(leads.id))
    .limit(page.limit)
    .offset(page.offset);

  return rows.map(({ lead, sourceImportId, sourceImportName }) => ({
    ...lead,
    sourceImportId,
    sourceImportName,
  }));
}

export async function listLeadIds(userId: string, filters: LeadListFilters) {
  const conditions = buildLeadConditions(userId, filters);
  return db
    .select({ id: leads.id })
    .from(leads)
    .where(and(...conditions))
    .orderBy(desc(leads.createdAt), desc(leads.id));
}

export async function getLeadStats(userId: string, filters: LeadListFilters) {
  const conditions = buildLeadConditions(userId, filters);
  const where = and(...conditions);

  const [totalRow] = await db
    .select({ total: count() })
    .from(leads)
    .where(where);

  const total = Number(totalRow?.total ?? 0);

  const [enrichedRow] = await db
    .select({ n: count() })
    .from(leads)
    .where(
      and(
        where,
        eq(leads.enrichmentStatus, "enriched"),
        sql`(${leads.gicsSectorCode} is not null or ${leads.gicsClassificationKey} is not null)`
      )
    );

  const industryRows = await db
    .select({ code: leads.gicsIndustryCode })
    .from(leads)
    .where(
      and(where, sql`${leads.gicsIndustryCode} is not null`)
    );
  const subRows = await db
    .select({ code: leads.gicsSubIndustryCode })
    .from(leads)
    .where(
      and(where, sql`${leads.gicsSubIndustryCode} is not null`)
    );
  const companyRows = await db
    .select({ company: leads.company })
    .from(leads)
    .where(and(where, sql`${leads.company} is not null`));
  const countryRows = await db
    .select({ country: leads.country })
    .from(leads)
    .where(and(where, sql`${leads.country} is not null`));

  return {
    total,
    industries: new Set(
      industryRows.map((r) => r.code).filter((c): c is string => !!c)
    ).size,
    subIndustries: new Set(
      subRows.map((r) => r.code).filter((c): c is string => !!c)
    ).size,
    companies: new Set(
      companyRows
        .map((r) => r.company?.trim().toLowerCase())
        .filter((c): c is string => !!c)
    ).size,
    countries: new Set(
      countryRows
        .map((r) => r.country?.trim().toLowerCase())
        .filter((c): c is string => !!c)
    ).size,
    enrichedAndClassified: Number(enrichedRow?.n ?? 0),
  };
}
