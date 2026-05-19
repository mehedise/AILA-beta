import { getObjectBuffer } from "@/lib/storage/r2";

export async function downloadPdfFromR2(fileKey: string): Promise<Buffer> {
  return getObjectBuffer(fileKey);
}

export async function getPdfPageCount(buf: Buffer): Promise<number> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buf),
    useSystemFonts: true,
  });
  const doc = await loadingTask.promise;
  const count = doc.numPages;
  await doc.destroy();
  return count;
}
