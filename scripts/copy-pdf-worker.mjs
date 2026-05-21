import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const src = path.join(
  path.dirname(require.resolve("pdfjs-dist/package.json")),
  "legacy",
  "build",
  "pdf.worker.mjs"
);
const dest = path.join(process.cwd(), "lib", "pdf", "vendor", "pdf.worker.mjs");

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log(`Copied pdf.worker.mjs -> ${dest}`);
