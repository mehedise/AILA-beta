import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  LARGE_FILE_BYTES,
  VERCEL_DIRECT_UPLOAD_MAX_BYTES,
  resolveImportSettings,
  type ImportProcessingMode,
} from "@/lib/imports/settings";
import { createMultipartUpload } from "@/lib/storage/r2";

const MAX_MULTIPART_BYTES = 500 * 1024 * 1024;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    fileName?: string;
    fileSize?: number;
    contentType?: string;
  };

  const fileName = body.fileName?.trim();
  const fileSize = Number(body.fileSize ?? 0);
  if (!fileName || !Number.isFinite(fileSize) || fileSize <= 0) {
    return NextResponse.json({ error: "Invalid file metadata" }, { status: 400 });
  }

  if (fileSize > MAX_MULTIPART_BYTES) {
    return NextResponse.json(
      { error: "File exceeds 500MB limit" },
      { status: 400 }
    );
  }

  if (fileSize <= VERCEL_DIRECT_UPLOAD_MAX_BYTES) {
    return NextResponse.json(
      {
        error:
          "Use standard upload for files 4MB or smaller",
        useStandardUpload: true,
      },
      { status: 400 }
    );
  }

  const lower = fileName.toLowerCase();
  let sourceType: "xlsx" | "pdf";
  let ext: string;
  if (lower.endsWith(".pdf")) {
    sourceType = "pdf";
    ext = "pdf";
  } else if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    sourceType = "xlsx";
    ext = lower.endsWith(".xls") ? "xls" : "xlsx";
  } else {
    return NextResponse.json(
      { error: "Only .xlsx, .xls, and .pdf files are supported" },
      { status: 400 }
    );
  }

  const importId = randomUUID();
  const fileKey = `imports/${importId}/source.${ext}`;
  const uploadId = await createMultipartUpload(
    fileKey,
    body.contentType || "application/octet-stream"
  );

  const partSize = 10 * 1024 * 1024;
  const partCount = Math.ceil(fileSize / partSize);

  const processingMode: ImportProcessingMode =
    fileSize > LARGE_FILE_BYTES ? "large" : "standard";

  return NextResponse.json({
    importId,
    fileKey,
    fileName,
    fileSize,
    sourceType,
    uploadId,
    partSize,
    partCount,
    processingMode,
    importSettings: resolveImportSettings(processingMode),
  });
}
