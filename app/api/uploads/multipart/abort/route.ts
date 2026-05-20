import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { abortMultipartUpload } from "@/lib/storage/r2";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    fileKey?: string;
    uploadId?: string;
  };

  const fileKey = body.fileKey?.trim();
  const uploadId = body.uploadId?.trim();
  if (!fileKey || !uploadId) {
    return NextResponse.json({ error: "Invalid abort request" }, { status: 400 });
  }

  await abortMultipartUpload(fileKey, uploadId);
  return NextResponse.json({ ok: true });
}
