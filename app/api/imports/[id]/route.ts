import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { extractedLeads, imports } from "@/lib/db/schema";
import { pageArtifactsPrefix } from "@/lib/pdf/page-artifacts";
import { deleteObject, deleteObjectsByPrefix } from "@/lib/storage/r2";

export async function GET(
  _req: Request,
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

  const leads = await db
    .select()
    .from(extractedLeads)
    .where(eq(extractedLeads.importId, id));

  return NextResponse.json({ import: imp, extractedLeads: leads });
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

  const [imp] = await db
    .select()
    .from(imports)
    .where(and(eq(imports.id, id), eq(imports.userId, userId)));

  if (!imp) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Collect any card-image keys we should clean up from R2.
  const cardRows = await db
    .select({ cardImageUrl: extractedLeads.cardImageUrl })
    .from(extractedLeads)
    .where(eq(extractedLeads.importId, id));

  const result = await db
    .delete(imports)
    .where(and(eq(imports.id, id), eq(imports.userId, userId)))
    .returning({ id: imports.id });

  if (result.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Best-effort R2 cleanup; ignore individual failures.
  const keysToDelete = [
    imp.fileKey,
    ...cardRows
      .map((r) => r.cardImageUrl ?? "")
      .filter((k) => k && !/^https?:\/\//.test(k)),
  ].filter(Boolean);

  await Promise.allSettled([
    ...keysToDelete.map((key) => deleteObject(key as string)),
    deleteObjectsByPrefix(pageArtifactsPrefix(id)),
  ]);

  return NextResponse.json({ ok: true, id: result[0].id });
}
