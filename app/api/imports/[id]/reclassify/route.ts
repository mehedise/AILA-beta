import { auth } from "@clerk/nextjs/server";
import { and, eq, isNull, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { extractedLeads, imports } from "@/lib/db/schema";
import { inngest } from "@/lib/inngest/client";

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

  const missing = await db
    .select({ id: extractedLeads.id })
    .from(extractedLeads)
    .where(
      and(
        eq(extractedLeads.importId, id),
        or(
          isNull(extractedLeads.gicsClassificationKey),
          eq(extractedLeads.gicsClassificationKey, "")
        )
      )
    );

  if (missing.length === 0) {
    return NextResponse.json({
      ok: true,
      queued: 0,
      message: "No leads require reclassification",
    });
  }

  const events = missing.map((row) => ({
    name: "lead/classify.requested" as const,
    data: { extractedLeadId: row.id },
  }));

  await inngest.send(events);

  return NextResponse.json({
    ok: true,
    queued: events.length,
  });
}
