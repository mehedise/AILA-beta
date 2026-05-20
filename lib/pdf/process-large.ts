import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { imports } from "@/lib/db/schema";
import { downloadPdfFromR2, getPdfPageCount } from "@/lib/pdf/load";
import { prerenderPdfChunk } from "@/lib/pdf/prerender";

/** Pages prepared per step in large-import mode (single PDF download per step). */
export const LARGE_PRERENDER_CHUNK = 50;

export async function isImportTerminated(importId: string): Promise<boolean> {
  const [imp] = await db
    .select({ status: imports.status })
    .from(imports)
    .where(eq(imports.id, importId));
  return imp?.status === "terminated";
}

export async function countAndInitLargeImport(
  importId: string,
  fileKey: string
): Promise<number> {
  const buf = await downloadPdfFromR2(fileKey);
  const pageCount = await getPdfPageCount(buf);
  await db
    .update(imports)
    .set({
      status: "counting_pages",
      totalItems: pageCount,
      processedItems: 0,
      pagesPrepared: 0,
    })
    .where(eq(imports.id, importId));
  return pageCount;
}

export async function prerenderLargeChunk(
  importId: string,
  fileKey: string,
  start: number,
  end: number
) {
  const buf = await downloadPdfFromR2(fileKey);
  const summaries = await prerenderPdfChunk(buf, importId, start, end);

  const [imp] = await db
    .select({
      pagesPrepared: imports.pagesPrepared,
      totalItems: imports.totalItems,
    })
    .from(imports)
    .where(eq(imports.id, importId));

  const nextPrepared = Math.min(
    imp?.totalItems ?? summaries.length,
    (imp?.pagesPrepared ?? 0) + summaries.length
  );

  await db
    .update(imports)
    .set({
      pagesPrepared: nextPrepared,
      status: "preparing_pages",
    })
    .where(eq(imports.id, importId));

  return summaries;
}
