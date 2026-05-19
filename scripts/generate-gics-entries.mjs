import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.join(__dirname, "../lib/taxonomy/gics-map-2023.csv");
const outPath = path.join(__dirname, "../lib/taxonomy/gics-entries.generated.ts");

function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

const raw = fs.readFileSync(csvPath, "utf8").trim();
const lines = raw.split(/\r?\n/);
const header = parseCsvLine(lines[0]);

const expected = [
  "SectorId",
  "Sector",
  "IndustryGroupId",
  "IndustryGroup",
  "IndustryId",
  "Industry",
  "SubIndustryId",
  "SubIndustry",
  "SubIndustryDescription",
];

if (header.join(",") !== expected.join(",")) {
  throw new Error(`Unexpected CSV header: ${header.join(",")}`);
}

const entries = [];

for (const line of lines.slice(1)) {
  if (!line.trim()) continue;
  const [
    sectorId,
    sector,
    industryGroupId,
    industryGroup,
    industryId,
    industry,
    subIndustryId,
    subIndustry,
    subIndustryDescription,
  ] = parseCsvLine(line);

  entries.push({
    key: subIndustryId,
    sectorId,
    sector,
    industryGroupId,
    industryGroup,
    industryId,
    industry,
    subIndustryId,
    subIndustry,
    subIndustryDescription,
  });
}

const uniqueKeys = new Set(entries.map((e) => e.key));
if (uniqueKeys.size !== entries.length) {
  throw new Error("Duplicate SubIndustryId keys in CSV");
}

const file = `/* eslint-disable */
// Auto-generated from lib/taxonomy/gics-map-2023.csv — run: node scripts/generate-gics-entries.mjs

export type GicsEntry = {
  key: string;
  sectorId: string;
  sector: string;
  industryGroupId: string;
  industryGroup: string;
  industryId: string;
  industry: string;
  subIndustryId: string;
  subIndustry: string;
  subIndustryDescription: string;
};

export const GICS_ENTRIES: GicsEntry[] = ${JSON.stringify(entries, null, 2)} as const;

export const GICS_ENTRY_KEYS = GICS_ENTRIES.map((e) => e.key) as [string, ...string[]];
`;

fs.writeFileSync(outPath, file);
console.log(`Wrote ${entries.length} entries to ${outPath}`);
