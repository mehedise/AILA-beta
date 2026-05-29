import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { imports } from "@/lib/db/schema";

export async function POST(
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
    .where(eq(imports.id, id));

  if (!imp) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (imp.status === "completed" || imp.status === "terminated") {
    return NextResponse.json({ import: imp });
  }

  const [updated] = await db
    .update(imports)
    .set({
      status: "terminated",
      error: "Import terminated by user",
    })
    .where(eq(imports.id, id))
    .returning();

  return NextResponse.json({ import: updated });
}
