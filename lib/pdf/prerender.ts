import sharp from "sharp";
import {
  type PageArtifact,
  writePageArtifact,
  writePageImage,
} from "./page-artifacts";

/**
 * Minimum text length (whitespace-normalized) for a page to be considered
 * "text-rich" — the structuring AI call can rely on the text layer and we
 * can skip rasterization entirely.
 */
const TEXT_RICH_THRESHOLD = 30;

const DEFAULT_RENDER_SCALE = 2.0;
const MAX_STORED_IMAGE_DIMENSION = 1400;
const JPEG_QUALITY = 78;

type PdfPage = {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  getTextContent: () => Promise<{
    items: Array<{ str?: string; transform?: number[] }>;
  }>;
  getAnnotations: () => Promise<Array<{ url?: string }>>;
  render: (opts: {
    canvasContext: unknown;
    viewport: unknown;
    canvas?: unknown;
  }) => { promise: Promise<void> };
  cleanup: () => void;
};

type PdfDoc = {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
  destroy(): Promise<void>;
};

async function loadDoc(pdfBuffer: Buffer): Promise<PdfDoc> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
  });
  return (await loadingTask.promise) as unknown as PdfDoc;
}

function extractAnnotationUrls(
  annotations: Array<{ url?: string }>
): string[] {
  return annotations
    .map((a) => a.url ?? null)
    .filter((u): u is string => Boolean(u));
}

async function extractTextOnly(page: PdfPage): Promise<{
  text: string;
  annotationUrls: string[];
}> {
  const content = await page.getTextContent();
  const lines: string[] = [];
  let current = "";
  let lastY: number | null = null;
  for (const item of content.items) {
    if (typeof item.str !== "string" || !item.transform) continue;
    const y = item.transform[5];
    if (lastY !== null && Math.abs(y - lastY) > 4) {
      lines.push(current.trim());
      current = "";
    }
    current += item.str + " ";
    lastY = y;
  }
  if (current.trim()) lines.push(current.trim());

  const annotationUrls = extractAnnotationUrls(await page.getAnnotations());

  return {
    text: lines.filter(Boolean).join("\n"),
    annotationUrls,
  };
}

async function renderPageToPng(
  page: PdfPage,
  scale: number
): Promise<Buffer> {
  // @napi-rs/canvas is already a transitive dep (via pdf-to-png-converter)
  // and provides a Node-native Canvas that pdfjs can render into.
  const { Canvas } = await import("@napi-rs/canvas");
  const viewport = page.getViewport({ scale });
  const width = Math.ceil(viewport.width);
  const height = Math.ceil(viewport.height);
  const canvas = new Canvas(width, height);
  const context = canvas.getContext("2d");
  await page.render({
    canvasContext: context,
    viewport,
    canvas,
  }).promise;
  return canvas.toBuffer("image/png");
}

/**
 * Open the PDF once, then for every page in [start, end] (inclusive,
 * 1-indexed):
 *  - extract text + annotation URLs,
 *  - if the text layer is sparse, render a 2× canvas using the SAME pdfjs
 *    document instance (no second pdfjs init like pdf-to-png-converter
 *    would do),
 *  - upload the JSON sidecar and (when rendered) a trimmed, resized JPEG to R2.
 *
 * `extract-page` later reads these small artifacts instead of re-pulling
 * and re-parsing the full source PDF. Net effect: ~5× faster per page.
 */
export async function prerenderPdfChunk(
  pdfBuffer: Buffer,
  importId: string,
  start: number,
  end: number,
  options: { scale?: number; forceImage?: boolean } = {}
): Promise<
  Array<{
    pageNumber: number;
    usableTextLength: number;
    hasImage: boolean;
  }>
> {
  const scale = options.scale ?? DEFAULT_RENDER_SCALE;
  const forceImage = options.forceImage ?? false;

  const doc = await loadDoc(pdfBuffer);
  const summaries: Array<{
    pageNumber: number;
    usableTextLength: number;
    hasImage: boolean;
  }> = [];

  try {
    for (let n = start; n <= end; n += 1) {
      const page = await doc.getPage(n);
      try {
        const { text, annotationUrls } = await extractTextOnly(page);
        const usableText = text.replace(/\s+/g, " ").trim();
        const useText = usableText.length >= TEXT_RICH_THRESHOLD;

        // Only render an image when text is too sparse to drive the
        // structuring AI on its own (or when the caller insists).
        const shouldRender = forceImage || !useText;

        const uploadJobs: Array<Promise<unknown>> = [];

        if (shouldRender) {
          const png = await renderPageToPng(page, scale);
          const image = await sharp(png)
            .trim({ threshold: 10 })
            .resize({
              width: MAX_STORED_IMAGE_DIMENSION,
              height: MAX_STORED_IMAGE_DIMENSION,
              fit: "inside",
              withoutEnlargement: true,
            })
            .jpeg({
              quality: JPEG_QUALITY,
              mozjpeg: true,
            })
            .toBuffer();
          uploadJobs.push(writePageImage(importId, n, image));
        }

        const artifact: PageArtifact = {
          text,
          annotationUrls,
          hasImage: shouldRender,
        };
        uploadJobs.push(writePageArtifact(importId, n, artifact));

        await Promise.all(uploadJobs);

        summaries.push({
          pageNumber: n,
          usableTextLength: usableText.length,
          hasImage: shouldRender,
        });
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await doc.destroy().catch(() => undefined);
  }

  return summaries;
}
