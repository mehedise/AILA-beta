import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { importBulkJobs, imports } from "@/lib/db/schema";
import { inngest } from "@/lib/inngest/client";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: importId } = await params;
  const [imp] = await db
    .select()
    .from(imports)
    .where(and(eq(imports.id, importId), eq(imports.userId, userId)));

  if (!imp) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [job] = await db
    .insert(importBulkJobs)
    .values({
      importId,
      userId,
      jobType: "export_csv",
      status: "pending",
    })
    .returning();

  await inngest.send({
    name: "import/bulk.export",
    data: { jobId: job.id, importId },
  });

  return NextResponse.json({
    job,
    message: "Export started — check bulk jobs for download link",
  });
}
