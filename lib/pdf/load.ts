import { getObjectBuffer } from "@/lib/storage/r2";
import { loadPdfJs, pdfDocumentInit } from "./pdfjs-server";

export async function downloadPdfFromR2(fileKey: string): Promise<Buffer> {
  return getObjectBuffer(fileKey);
}

export async function getPdfPageCount(buf: Buffer): Promise<number> {
  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument(pdfDocumentInit(buf));
  const doc = await loadingTask.promise;
  const count = doc.numPages;
  await doc.destroy();
  return count;
}
