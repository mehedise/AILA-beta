import sharp from "sharp";
import { pdfToPng } from "pdf-to-png-converter";
import {
  getSignedReadUrl,
  putObjectFromBuffer,
} from "@/lib/storage/r2";

export async function rasterizePageToR2(
  pdfBuffer: Buffer,
  importId: string,
  pageNumber: number
): Promise<string> {
  const pages = await pdfToPng(pdfBuffer, {
    pagesToProcess: [pageNumber],
    viewportScale: 2.0,
    disableFontFace: false,
  });

  const page = pages[0];
  if (!page?.content) {
    throw new Error(`Failed to rasterize page ${pageNumber}`);
  }

  const trimmed = await sharp(page.content)
    .trim({ threshold: 10 })
    .png()
    .toBuffer();

  const key = `imports/${importId}/pages/${pageNumber}.png`;
  await putObjectFromBuffer(key, trimmed, "image/png");
  return getSignedReadUrl(key, 86400);
}
