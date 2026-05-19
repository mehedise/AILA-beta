import type { GicsEntry } from "@/lib/taxonomy/gics";

export function gicsToDbFields(entry: GicsEntry) {
  return {
    gicsSector: entry.sector,
    gicsSectorCode: entry.sectorId,
    gicsIndustryGroup: entry.industryGroup,
    gicsIndustryGroupCode: entry.industryGroupId,
    gicsIndustry: entry.industry,
    gicsIndustryCode: entry.industryId,
    gicsSubIndustry: entry.subIndustry,
    gicsSubIndustryCode: entry.subIndustryId,
    gicsSubIndustryDescription: entry.subIndustryDescription,
    gicsClassificationKey: entry.key,
  };
}
