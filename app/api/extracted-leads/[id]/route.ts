import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { extractedLeads, imports } from "@/lib/db/schema";
import { resolveGicsFields } from "@/lib/taxonomy/resolve-gics";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [lead] = await db
    .select({
      lead: extractedLeads,
      import: imports,
    })
    .from(extractedLeads)
    .innerJoin(imports, eq(extractedLeads.importId, imports.id))
    .where(eq(extractedLeads.id, id));

  if (!lead || lead.import.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ extractedLead: lead.lead, import: lead.import });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  const [existing] = await db
    .select({
      lead: extractedLeads,
      import: imports,
    })
    .from(extractedLeads)
    .innerJoin(imports, eq(extractedLeads.importId, imports.id))
    .where(eq(extractedLeads.id, id));

  if (!existing || existing.import.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const gics = resolveGicsFields(body, existing.lead);

  const displayName = body.displayName ?? existing.lead.displayName ?? existing.lead.name;
  const firstName = body.firstName ?? existing.lead.firstName;
  const lastName = body.lastName ?? existing.lead.lastName;
  const composedName =
    displayName ||
    [firstName, lastName].filter(Boolean).join(" ").trim() ||
    existing.lead.name;

  const [updated] = await db
    .update(extractedLeads)
    .set({
      displayName,
      firstName,
      lastName,
      name: composedName,
      title: body.title ?? existing.lead.title,
      company: body.company ?? existing.lead.company,
      email: body.email ?? existing.lead.email,
      phone: body.phone ?? existing.lead.phone,
      mobile: body.mobile ?? existing.lead.mobile,
      website: body.website ?? existing.lead.website,
      address: body.address ?? existing.lead.address,
      city: body.city ?? existing.lead.city,
      zipCode: body.zipCode ?? existing.lead.zipCode,
      country: body.country ?? existing.lead.country,
      annualRevenue: body.annualRevenue ?? existing.lead.annualRevenue,
      employeeHeadcount:
        body.employeeHeadcount ?? existing.lead.employeeHeadcount,
      ...gics,
    })
    .where(eq(extractedLeads.id, id))
    .returning();

  return NextResponse.json({ extractedLead: updated });
}
