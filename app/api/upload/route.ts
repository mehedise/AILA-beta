import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { imports } from "@/lib/db/schema";
import { putObjectFromBuffer } from "@/lib/storage/r2";
import { inngest } from "@/lib/inngest/client";
import { randomUUID } from "crypto";

const MAX_SIZE = 50 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "File exceeds 50MB limit" },
        { status: 400 }
      );
    }

    const name = file.name.toLowerCase();
    let sourceType: "xlsx" | "pdf";
    let ext: string;

    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      sourceType = "xlsx";
      ext = name.endsWith(".xls") ? "xls" : "xlsx";
    } else if (name.endsWith(".pdf")) {
      sourceType = "pdf";
      ext = "pdf";
    } else {
      return NextResponse.json(
        { error: "Only .xlsx, .xls, and .pdf files are supported" },
        { status: 400 }
      );
    }

    const importId = randomUUID();
    const fileKey = `imports/${importId}/source.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());

    await putObjectFromBuffer(
      fileKey,
      buf,
      file.type || "application/octet-stream"
    );

    const [row] = await db
      .insert(imports)
      .values({
        id: importId,
        userId,
        sourceType,
        fileUrl: fileKey,
        fileKey,
        fileName: file.name,
        status: "uploaded",
      })
      .returning();

    await inngest.send({
      name: "import/uploaded",
      data: { importId, sourceType, fileKey },
    });

    return NextResponse.json({ import: row });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to upload file";
    console.error("[upload] failed:", message, error);
    // `req.formData()` throws a generic parse error when the proxy buffer
    // truncates the body — surface a friendlier hint so the user knows
    // what to do.
    const isFormDataParseError =
      /formdata|multipart|boundary/i.test(message);
    return NextResponse.json(
      {
        error: isFormDataParseError
          ? "Upload failed — file may be too large for the dev server to buffer. Try a smaller file or raise `experimental.proxyClientMaxBodySize`."
          : message,
      },
      { status: 500 }
    );
  }
}
