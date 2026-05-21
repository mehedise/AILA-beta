import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfjsPromise: Promise<PdfJsModule> | null = null;

/** Configure pdfjs-dist for Node/Vercel (fixes "Setting up fake worker failed"). */
export async function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const pkgRoot = path.dirname(
        require.resolve("pdfjs-dist/package.json")
      );
      const workerPath = path.join(pkgRoot, "legacy", "build", "pdf.worker.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
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
