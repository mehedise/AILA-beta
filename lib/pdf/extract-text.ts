import { loadPdfJs, pdfDocumentInit } from "./pdfjs-server";

export type PageTextResult = {
  text: string;
  annotationUrls: string[];
};

export async function extractPageText(
  pdfBuffer: Buffer,
  pageNumber: number
): Promise<PageTextResult> {
  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument(pdfDocumentInit(pdfBuffer));
  const doc = await loadingTask.promise;
  const page = await doc.getPage(pageNumber);

  const content = await page.getTextContent();
  let lastY: number | null = null;
  const lines: string[] = [];
  let current = "";

  for (const item of content.items) {
    if (!("str" in item)) continue;
    const y = item.transform[5];
    if (lastY !== null && Math.abs(y - lastY) > 4) {
      lines.push(current.trim());
      current = "";
    }
    current += item.str + " ";
    lastY = y;
  }
  if (current.trim()) lines.push(current.trim());

  const annotations = await page.getAnnotations();
  const annotationUrls = annotations
    .map((a) => {
      const ann = a as { subtype?: string; url?: string; dest?: string };
      if (ann.url) return ann.url;
      return null;
    })
    .filter((u): u is string => Boolean(u));

  await doc.destroy();

  return {
    text: lines.filter(Boolean).join("\n"),
    annotationUrls,
  };
}
