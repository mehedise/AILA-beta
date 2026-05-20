import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { extractedLeads, importPageJobs, imports } from "@/lib/db/schema";
import { getImportSettings } from "@/lib/imports/get-settings";
import { inngest } from "@/lib/inngest/client";

/**
 * Re-queues page extractions for any pages that don't yet have a saved
 * extracted lead row. This recovers an import when some pages permanently
 * failed (e.g. OpenAI 429 storms that exhausted retries before the
 * graceful fallback path was in place).
 */
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
    .where(and(eq(imports.id, id), eq(imports.userId, userId)));

  if (!imp) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (imp.sourceType !== "pdf") {
    return NextResponse.json(
      { error: "Only PDF imports can be retried per-page" },
      { status: 400 }
    );
  }

  if (imp.totalItems <= 0) {
    return NextResponse.json(
      { error: "Import has no pages registered yet" },
      { status: 400 }
    );
  }

  const existing = await db
    .select({ pageNumber: extractedLeads.pageNumber })
    .from(extractedLeads)
    .where(eq(extractedLeads.importId, id));

  const completed = new Set(
    existing
      .map((row) => row.pageNumber)
      .filter((n): n is number => typeof n === "number")
  );

  const missing: number[] = [];
  for (let page = 1; page <= imp.totalItems; page += 1) {
    if (!completed.has(page)) missing.push(page);
  }

  if (missing.length === 0) {
    return NextResponse.json({
      ok: true,
      queued: 0,
      message: "No missing pages",
    });
  }

  await db
    .update(imports)
    .set({ status: "processing", error: null })
    .where(eq(imports.id, id));

  const settings = getImportSettings(imp);
  const batchSize = settings.batchSize ?? 100;

  if (settings.batchExtraction || imp.processingMode === "large") {
    const ranges: Array<{ startPage: number; endPage: number }> = [];
    for (let i = 0; i < missing.length; i += batchSize) {
      const chunk = missing.slice(i, i + batchSize);
      ranges.push({
        startPage: chunk[0],
        endPage: chunk[chunk.length - 1],
      });
    }

    const jobs = await db
      .insert(importPageJobs)
      .values(
        ranges.map((r) => ({
          importId: id,
          startPage: r.startPage,
          endPage: r.endPage,
          status: "pending" as const,
        }))
      )
      .returning();

    const events = jobs.map((job) => ({
      name: "import/pdf.page.extract.batch" as const,
      data: {
        importId: id,
        fileKey: imp.fileKey,
        jobId: job.id,
        startPage: job.startPage,
        endPage: job.endPage,
      },
    }));

    const CHUNK = 50;
    for (let i = 0; i < events.length; i += CHUNK) {
      await inngest.send(events.slice(i, i + CHUNK));
    }

    return NextResponse.json({
      ok: true,
      queued: missing.length,
      batches: events.length,
      totalPages: imp.totalItems,
      alreadyCompleted: completed.size,
    });
  }

  const events = missing.map((pageNumber) => ({
    name: "import/pdf.page.extract" as const,
    data: {
      importId: id,
      fileKey: imp.fileKey,
      pageNumber,
      autoEnrich: settings.autoEnrich,
    },
  }));

  const CHUNK = 100;
  for (let i = 0; i < events.length; i += CHUNK) {
    await inngest.send(events.slice(i, i + CHUNK));
  }

  return NextResponse.json({
    ok: true,
    queued: events.length,
    totalPages: imp.totalItems,
    alreadyCompleted: completed.size,
  });
}
