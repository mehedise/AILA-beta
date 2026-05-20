import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  signUploadPartUrl,
  uploadMultipartPartFromBuffer,
} from "@/lib/storage/r2";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    fileKey?: string;
    uploadId?: string;
    partNumber?: number;
  };

  const fileKey = body.fileKey?.trim();
  const uploadId = body.uploadId?.trim();
  const partNumber = Number(body.partNumber);

  if (!fileKey || !uploadId || !Number.isFinite(partNumber) || partNumber < 1) {
    return NextResponse.json({ error: "Invalid part request" }, { status: 400 });
  }

  const url = await signUploadPartUrl(fileKey, uploadId, partNumber);
  return NextResponse.json({ url, partNumber });
}

export async function PUT(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const fileKey = url.searchParams.get("fileKey")?.trim();
  const uploadId = url.searchParams.get("uploadId")?.trim();
  const partNumber = Number(url.searchParams.get("partNumber"));

  if (!fileKey || !uploadId || !Number.isFinite(partNumber) || partNumber < 1) {
    return NextResponse.json({ error: "Invalid part request" }, { status: 400 });
  }

  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length === 0) {
    return NextResponse.json({ error: "Part body is empty" }, { status: 400 });
  }

  const etag = await uploadMultipartPartFromBuffer(
    fileKey,
    uploadId,
    partNumber,
    buf
  );

  return NextResponse.json({ etag, partNumber });
}
