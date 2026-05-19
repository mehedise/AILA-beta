import { auth } from "@clerk/nextjs/server";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { imports } from "@/lib/db/schema";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(imports)
    .where(eq(imports.userId, userId))
    .orderBy(desc(imports.createdAt));

  return NextResponse.json({ imports: rows });
}
