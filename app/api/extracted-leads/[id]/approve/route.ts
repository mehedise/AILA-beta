import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { extractedLeads, imports, leads } from "@/lib/db/schema";
import { buildDedupeKey } from "@/lib/dedupe";
import {
  normalizeEmail,
  normalizePhone,
  normalizeWebsite,
} from "@/lib/excel/normalize";
import { resolveGicsFields } from "@/lib/taxonomy/resolve-gics";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const [existing] = await db
    .select({
      lead: extractedLeads,
      import: imports,
    })
    .from(extractedLeads)
    .innerJoin(imports, eq(extractedLeads.importId, imports.id))
    .where(eq(extractedLeads.id, id));

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const gics = resolveGicsFields(body, existing.lead);

  const displayName =
    body.displayName ?? existing.lead.displayName ?? existing.lead.name;
  const firstName = body.firstName ?? existing.lead.firstName;
  const lastName = body.lastName ?? existing.lead.lastName;
  const composedName =
    displayName ||
    [firstName, lastName].filter(Boolean).join(" ").trim() ||
    existing.lead.name;

  const leadData = {
    displayName,
    firstName,
    lastName,
    name: composedName,
    title: body.title ?? existing.lead.title,
    company: body.company ?? existing.lead.company,
    email: normalizeEmail(body.email ?? existing.lead.email),
    phone: normalizePhone(body.phone ?? existing.lead.phone),
    mobile: normalizePhone(body.mobile ?? existing.lead.mobile),
    website: normalizeWebsite(body.website ?? existing.lead.website),
    address: body.address ?? existing.lead.address,
    city: body.city ?? existing.lead.city,
    zipCode: body.zipCode ?? existing.lead.zipCode,
    country: body.country ?? existing.lead.country,
    annualRevenue: body.annualRevenue ?? existing.lead.annualRevenue,
    employeeHeadcount:
      body.employeeHeadcount ?? existing.lead.employeeHeadcount,
    logoUrl: existing.lead.logoUrl,
    enrichmentStatus: existing.lead.enrichmentStatus,
    enrichmentJson: existing.lead.enrichmentJson,
    ...gics,
  };

  const dedupeKey = buildDedupeKey(leadData);

  const [existingLead] = await db
    .select()
    .from(leads)
    .where(eq(leads.dedupeKey, dedupeKey));

  let savedLead;

  if (existingLead) {
    [savedLead] = await db
      .update(leads)
      .set({
        ...leadData,
        updatedAt: new Date(),
      })
      .where(eq(leads.id, existingLead.id))
      .returning();
  } else {
    [savedLead] = await db
      .insert(leads)
      .values({
        userId,
        ...leadData,
        sourceExtractedLeadId: id,
        dedupeKey,
      })
      .returning();
  }

  await db
    .update(extractedLeads)
    .set({
      reviewStatus: "approved",
      ...leadData,
    })
    .where(eq(extractedLeads.id, id));

  return NextResponse.json({ lead: savedLead });
}
