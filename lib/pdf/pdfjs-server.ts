import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

const pdfDir = path.dirname(fileURLToPath(import.meta.url));
const vendoredWorkerPath = path.join(pdfDir, "vendor", "pdf.worker.mjs");

let pdfjsPromise: Promise<PdfJsModule> | null = null;

function resolveWorkerSrc(): string {
  if (fs.existsSync(vendoredWorkerPath)) {
    return pathToFileURL(vendoredWorkerPath).href;
  }
  const pkgRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
  return pathToFileURL(
    path.join(pkgRoot, "legacy", "build", "pdf.worker.mjs")
  ).href;
}

/** Configure pdfjs-dist for Node/Vercel (fixes "Setting up fake worker failed"). */
export async function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = resolveWorkerSrc();
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

export function pdfDocumentInit(buf: Buffer) {
  return {
    data: new Uint8Array(buf),
    useSystemFonts: true,
    useWorkerFetch: false,
    isEvalSupported: false,
  };
}
