import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { leads } from "@/lib/db/schema";
import {
  normalizeEmail,
  normalizePhone,
  normalizeWebsite,
} from "@/lib/excel/normalize";

const EDITABLE_FIELDS = [
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
] as const;

type EditableField = (typeof EDITABLE_FIELDS)[number];

function cleanString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
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
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const [existing] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, id), eq(leads.userId, userId)));

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updates: Partial<Record<EditableField, string | null>> = {};
  for (const key of EDITABLE_FIELDS) {
    if (key in body) updates[key] = cleanString(body[key]);
  }

  if (updates.email !== undefined) updates.email = normalizeEmail(updates.email);
  if (updates.phone !== undefined) updates.phone = normalizePhone(updates.phone);
  if (updates.mobile !== undefined)
    updates.mobile = normalizePhone(updates.mobile);
  if (updates.website !== undefined)
    updates.website = normalizeWebsite(updates.website);

  // Keep `name` in sync with display name / first+last when those change.
  const nextDisplay = updates.displayName ?? existing.displayName;
  const nextFirst = updates.firstName ?? existing.firstName;
  const nextLast = updates.lastName ?? existing.lastName;
  const composedName =
    nextDisplay ||
    [nextFirst, nextLast].filter(Boolean).join(" ").trim() ||
    existing.name;

  const [updated] = await db
    .update(leads)
    .set({
      ...updates,
      name: composedName,
      updatedAt: new Date(),
    })
    .where(and(eq(leads.id, id), eq(leads.userId, userId)))
    .returning();

  return NextResponse.json({ lead: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const result = await db
    .delete(leads)
    .where(and(eq(leads.id, id), eq(leads.userId, userId)))
    .returning({ id: leads.id });

  if (result.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, id: result[0].id });
}
