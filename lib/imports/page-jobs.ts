import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { importPageJobs } from "@/lib/db/schema";

export async function createPageJobRanges(
  importId: string,
  pageCount: number,
  batchSize: number
) {
  const ranges: Array<{ startPage: number; endPage: number }> = [];
  for (let start = 1; start <= pageCount; start += batchSize) {
    ranges.push({
      startPage: start,
      endPage: Math.min(start + batchSize - 1, pageCount),
    });
  }

  if (ranges.length === 0) return [];

  const inserted = await db
    .insert(importPageJobs)
    .values(
      ranges.map((r) => ({
        importId,
        startPage: r.startPage,
        endPage: r.endPage,
        status: "pending" as const,
      }))
    )
    .returning();

  return inserted;
}

export async function markPageJobStatus(
  jobId: string,
  status: "running" | "completed" | "failed",
  error?: string
) {
  const [existing] = await db
    .select()
    .from(importPageJobs)
    .where(eq(importPageJobs.id, jobId));

  await db
    .update(importPageJobs)
    .set({
      status,
      error: error ?? null,
      attempts:
        status === "running"
          ? (existing?.attempts ?? 0) + 1
          : (existing?.attempts ?? 0),
      updatedAt: new Date(),
    })
    .where(eq(importPageJobs.id, jobId));
}

export async function listFailedPageJobs(importId: string) {
  return db
    .select()
    .from(importPageJobs)
    .where(
      and(
        eq(importPageJobs.importId, importId),
        eq(importPageJobs.status, "failed")
      )
    );
}
