import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  buildPageInfo,
  parsePageParams,
  parseSortParams,
} from "@/lib/api/pagination";
import {
  countLeads,
  listLeadIds,
  listLeads,
  type LeadListFilters,
} from "@/lib/db/queries/leads";

const TEXT_COLUMN_KEYS = [
  "displayName",
  "firstName",
  "lastName",
  "name",
  "title",
  "company",
  "email",
  "phone",
  "mobile",
  "website",
  "address",
  "city",
  "zipCode",
  "country",
  "annualRevenue",
  "employeeHeadcount",
  "gicsSubIndustryDescription",
] as const;

const SORTABLE = [
  "displayName",
  "firstName",
  "lastName",
  "title",
  "company",
  "email",
  "phone",
  "mobile",
  "website",
  "address",
  "city",
  "zipCode",
  "country",
  "annualRevenue",
  "employeeHeadcount",
  "gicsSector",
  "gicsIndustryGroup",
  "gicsIndustry",
  "gicsSubIndustry",
  "gicsSubIndustryDescription",
  "createdAt",
] as const;

function parseFilters(searchParams: URLSearchParams): LeadListFilters {
  const columns: Record<string, string> = {};
  for (const key of TEXT_COLUMN_KEYS) {
    const v = searchParams.get(key)?.trim();
    if (v) columns[key] = v;
  }
  return {
    q: searchParams.get("q") ?? undefined,
    importId: searchParams.get("importId") ?? undefined,
    unclassified: searchParams.get("unclassified") === "true",
    sector: searchParams.get("sector") ?? undefined,
    industryGroup: searchParams.get("industryGroup") ?? undefined,
    industry: searchParams.get("industry") ?? undefined,
    subIndustry: searchParams.get("subIndustry") ?? undefined,
    columns: Object.keys(columns).length > 0 ? columns : undefined,
  };
}

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = parsePageParams(searchParams);
  const sort = parseSortParams(searchParams, SORTABLE, {
    by: "createdAt",
    dir: "desc",
  });
  const filters = parseFilters(searchParams);

  if (searchParams.get("idsOnly") === "true") {
    const rows = await listLeadIds(filters);
    return NextResponse.json({ ids: rows.map((row) => row.id) });
  }

  const [totalCount, rows] = await Promise.all([
    countLeads(filters),
    listLeads(filters, page, sort),
  ]);

  return NextResponse.json({
    leads: rows,
    pageInfo: buildPageInfo(totalCount, page),
  });
}
