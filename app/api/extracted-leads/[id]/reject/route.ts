import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { extractedLeads, imports } from "@/lib/db/schema";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

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

  const [updated] = await db
    .update(extractedLeads)
    .set({ reviewStatus: "rejected" })
    .where(eq(extractedLeads.id, id))
    .returning();

  return NextResponse.json({ extractedLead: updated });
}
