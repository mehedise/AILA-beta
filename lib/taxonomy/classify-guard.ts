/** Imports created before this date are never auto-classified with GICS. */
const GICS_CLASSIFY_AFTER = new Date(
  process.env.GICS_CLASSIFY_AFTER ?? "2026-05-19T00:00:00.000Z"
);

type ClassifiableLead = {
  industry?: string | null;
  industryCode?: string | null;
  gicsClassificationKey?: string | null;
  gicsSector?: string | null;
  gicsIndustryGroup?: string | null;
  gicsIndustry?: string | null;
  gicsSubIndustry?: string | null;
  gicsSubIndustryDescription?: string | null;
};

function hasLegacyMsicClassification(lead: ClassifiableLead): boolean {
  return Boolean(lead.industryCode && /^\d{5}$/.test(lead.industryCode));
}

function hasGicsClassification(lead: ClassifiableLead): boolean {
  return Boolean(
    (lead.gicsClassificationKey && /^\d{8}$/.test(lead.gicsClassificationKey)) ||
      lead.gicsSubIndustryDescription ||
      (lead.gicsSector && lead.gicsSubIndustry)
  );
}

export function shouldSkipGicsClassification(
  lead: ClassifiableLead,
  importCreatedAt: Date | string
): { skip: true; reason: string } | { skip: false } {
  const createdAt =
    importCreatedAt instanceof Date
      ? importCreatedAt
      : new Date(importCreatedAt);

  if (createdAt < GICS_CLASSIFY_AFTER) {
    return { skip: true, reason: "import_predates_gics" };
  }

  if (hasGicsClassification(lead)) {
    return { skip: true, reason: "already_has_gics" };
  }

  if (hasLegacyMsicClassification(lead)) {
    return { skip: true, reason: "already_has_msic" };
  }

  return { skip: false };
}
