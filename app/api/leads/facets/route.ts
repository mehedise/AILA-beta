import { auth } from "@clerk/nextjs/server";
import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { leads } from "@/lib/db/schema";
import { listImportsWithApprovedLeads } from "@/lib/db/queries/leads";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [countryRows, importRows] = await Promise.all([
    db
      .selectDistinct({ country: leads.country })
      .from(leads)
      .where(and(eq(leads.userId, userId), sql`${leads.country} is not null`)),
    listImportsWithApprovedLeads(userId),
  ]);

  const countries = Array.from(
    new Set(
      countryRows
        .map((row) => row.country?.trim())
        .filter((value): value is string => !!value)
    )
  ).sort((a, b) => a.localeCompare(b));

  return NextResponse.json({ countries, imports: importRows });
}
