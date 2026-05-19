import { auth } from "@clerk/nextjs/server";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { AnyColumn, SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { leads } from "@/lib/db/schema";

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

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const conditions: SQL[] = [eq(leads.userId, userId)];

  const q = searchParams.get("q")?.trim();
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
    const value = searchParams.get(key)?.trim();
    if (value) conditions.push(ilike(column, `%${value}%`));
  }

  const pushCode = (param: string, column: AnyColumn) => {
    const value = searchParams.get(param)?.trim();
    if (value && value !== "all") conditions.push(eq(column, value));
  };

  pushCode("sector", leads.gicsSectorCode);
  pushCode("industryGroup", leads.gicsIndustryGroupCode);
  pushCode("industry", leads.gicsIndustryCode);
  pushCode("subIndustry", leads.gicsSubIndustryCode);

  const rows = await db
    .select()
    .from(leads)
    .where(and(...conditions))
    .orderBy(desc(leads.createdAt));

  return NextResponse.json({ leads: rows });
}
