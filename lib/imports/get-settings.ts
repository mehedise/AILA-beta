import {
  DEFAULT_IMPORT_SETTINGS,
  LARGE_IMPORT_SETTINGS,
  type ImportProcessingMode,
  type ImportSettings,
} from "@/lib/imports/settings";
import type { Import } from "@/lib/db/schema";

export function getImportSettings(imp: Pick<Import, "processingMode" | "importSettings">): ImportSettings {
  const mode = (imp.processingMode ?? "standard") as ImportProcessingMode;
  const base = mode === "large" ? LARGE_IMPORT_SETTINGS : DEFAULT_IMPORT_SETTINGS;
  const overrides = imp.importSettings as Partial<ImportSettings> | null;
  return { ...base, ...overrides };
}
