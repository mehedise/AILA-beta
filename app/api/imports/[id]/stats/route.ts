import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { imports } from "@/lib/db/schema";
import { getExtractedLeadStats } from "@/lib/db/queries/extracted-leads";

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

  const stats = await getExtractedLeadStats(id);
  return NextResponse.json({ stats });
}
