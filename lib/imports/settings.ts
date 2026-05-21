export type ImportProcessingMode = "standard" | "large";

export type ImportSettings = {
  /** When false, enrichment runs only after user triggers it (default for large). */
  autoEnrich: boolean;
  autoClassify: boolean;
  visionForLowConfidenceOnly: boolean;
  /** Use batch extraction instead of per-page events. */
  batchExtraction: boolean;
  batchSize: number;
};

export const DEFAULT_IMPORT_SETTINGS: ImportSettings = {
  autoEnrich: true,
  autoClassify: true,
  visionForLowConfidenceOnly: true,
  batchExtraction: false,
  batchSize: 100,
};

export const LARGE_IMPORT_SETTINGS: ImportSettings = {
  autoEnrich: false,
  autoClassify: true,
  visionForLowConfidenceOnly: true,
  batchExtraction: true,
  batchSize: 100,
};

export function resolveImportSettings(
  mode: ImportProcessingMode,
  overrides?: Partial<ImportSettings> | null
): ImportSettings {
  const base =
    mode === "large" ? LARGE_IMPORT_SETTINGS : DEFAULT_IMPORT_SETTINGS;
  return { ...base, ...overrides };
}

/** File size above this uses the large PDF processing pipeline (bytes). */
export const LARGE_FILE_BYTES = 50 * 1024 * 1024;

/** Above Vercel's ~4.5MB function body limit — upload via R2 multipart instead. */
export const VERCEL_DIRECT_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

/** Page count above this uses large pipeline even if file is small. */
export const LARGE_PAGE_THRESHOLD = 500;
