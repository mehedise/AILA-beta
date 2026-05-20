import { auth } from "@clerk/nextjs/server";
import { and, eq, isNull, ne, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { extractedLeads, imports } from "@/lib/db/schema";
import { inngest } from "@/lib/inngest/client";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  const [imp] = await db
    .select()
    .from(imports)
    .where(and(eq(imports.id, id), eq(imports.userId, userId)));

  if (!imp) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Re-enrich any lead that has not been successfully enriched, or all
  // leads when ?force=1 is supplied.
  const condition = force
    ? eq(extractedLeads.importId, id)
    : and(
        eq(extractedLeads.importId, id),
        or(
          isNull(extractedLeads.enrichmentStatus),
          ne(extractedLeads.enrichmentStatus, "enriched")
        )
      );

  const rows = await db
    .select({ id: extractedLeads.id })
    .from(extractedLeads)
    .where(condition);

  if (rows.length === 0) {
    return NextResponse.json({
      ok: true,
      queued: 0,
      message: "All leads are already enriched",
    });
  }

  await db
    .update(extractedLeads)
    .set({ enrichmentStatus: "pending" })
    .where(condition);

  const events = rows.map((row) => ({
    name: "lead/enrich.requested" as const,
    data: { extractedLeadId: row.id },
  }));

  await inngest.send(events);
  await db.update(imports).set({ status: "enriching" }).where(eq(imports.id, id));

  return NextResponse.json({ ok: true, queued: events.length });
}
