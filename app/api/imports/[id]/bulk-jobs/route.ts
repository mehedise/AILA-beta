import { auth } from "@clerk/nextjs/server";
import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { importBulkJobs, imports } from "@/lib/db/schema";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: importId } = await params;
  const [imp] = await db
    .select({ id: imports.id })
    .from(imports)
    .where(eq(imports.id, importId));

  if (!imp) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const jobs = await db
    .select()
    .from(importBulkJobs)
    .where(eq(importBulkJobs.importId, importId))
    .orderBy(desc(importBulkJobs.createdAt))
    .limit(20);

  return NextResponse.json({ jobs });
}
