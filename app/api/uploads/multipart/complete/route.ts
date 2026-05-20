import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { imports } from "@/lib/db/schema";
import { inngest } from "@/lib/inngest/client";
import {
  resolveImportSettings,
  type ImportProcessingMode,
} from "@/lib/imports/settings";
import { completeMultipartUpload } from "@/lib/storage/r2";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    importId?: string;
    fileKey?: string;
    fileName?: string;
    fileSize?: number;
    sourceType?: "pdf" | "xlsx";
    uploadId?: string;
    parts?: Array<{ partNumber: number; etag: string }>;
    processingMode?: ImportProcessingMode;
  };

  const importId = body.importId?.trim();
  const fileKey = body.fileKey?.trim();
  const uploadId = body.uploadId?.trim();
  const fileName = body.fileName?.trim();
  const sourceType = body.sourceType;
  const parts = body.parts ?? [];

  if (!importId || !fileKey || !uploadId || !fileName || !sourceType) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  if (parts.length === 0) {
    return NextResponse.json({ error: "No upload parts" }, { status: 400 });
  }

  await completeMultipartUpload(fileKey, uploadId, parts);

  const mode = body.processingMode ?? "large";
  const settings = resolveImportSettings(mode);

  const [row] = await db
    .insert(imports)
    .values({
      id: importId,
      userId,
      sourceType,
      fileUrl: fileKey,
      fileKey,
      fileName,
      fileSizeBytes: body.fileSize ?? null,
      processingMode: mode,
      importSettings: settings,
      status: "uploaded",
    })
    .returning();

  await inngest.send({
    name: "import/uploaded",
    data: {
      importId,
      sourceType,
      fileKey,
      processingMode: mode,
    },
  });

  return NextResponse.json({ import: row });
}
