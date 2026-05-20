/** Rough per-lead cost estimates in USD for UI warnings (not billing). */
const STRUCTURE_COST = 0.002;
const VISION_COST = 0.008;
const ENRICH_COST = 0.01;
const CLASSIFY_BATCH_COST = 0.003; // amortized per lead in batch of 20

export type AiBudgetEstimate = {
  leadCount: number;
  structureUsd: number;
  visionUsd: number;
  enrichUsd: number;
  classifyUsd: number;
  totalUsd: number;
};

export function estimateImportAiCost(input: {
  leadCount: number;
  /** Fraction of pages expected to need vision (0-1). */
  visionRate?: number;
  includeEnrichment?: boolean;
  includeClassification?: boolean;
}): AiBudgetEstimate {
  const n = Math.max(0, input.leadCount);
  const visionRate = input.visionRate ?? 0.15;
  const structureUsd = n * STRUCTURE_COST;
  const visionUsd = n * visionRate * VISION_COST;
  const enrichUsd = input.includeEnrichment !== false ? n * ENRICH_COST : 0;
  const classifyUsd =
    input.includeClassification !== false
      ? Math.ceil(n / 20) * CLASSIFY_BATCH_COST * 20
      : 0;
  const totalUsd = structureUsd + visionUsd + enrichUsd + classifyUsd;
  return {
    leadCount: n,
    structureUsd,
    visionUsd,
    enrichUsd,
    classifyUsd,
    totalUsd,
  };
}

export function formatUsd(amount: number): string {
  if (amount < 0.01) return "< $0.01";
  if (amount < 1) return `~$${amount.toFixed(2)}`;
  return `~$${amount.toFixed(0)}`;
}
