import { PDFDocument } from "pdf-lib";
import { getObjectBuffer } from "@/lib/storage/r2";

export async function downloadPdfFromR2(fileKey: string): Promise<Buffer> {
  return getObjectBuffer(fileKey);
}

/** Page count without pdfjs worker (reliable on Vercel serverless). */
export async function getPdfPageCount(buf: Buffer): Promise<number> {
  const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
  return doc.getPageCount();
}
