import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getLeadStats, type LeadListFilters } from "@/lib/db/queries/leads";

function parseFilters(searchParams: URLSearchParams): LeadListFilters {
  const columns: Record<string, string> = {};
  const columnKeys = [
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
    "gicsSubIndustryDescription",
  ];
  for (const key of columnKeys) {
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

  const filters = parseFilters(new URL(req.url).searchParams);
  const stats = await getLeadStats(userId, filters);
  return NextResponse.json({ stats });
}
