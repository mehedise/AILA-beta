import { getGicsEntry } from "@/lib/taxonomy/gics";
import { gicsToDbFields } from "@/lib/taxonomy/gics-fields";

type GicsBody = {
  gicsClassificationKey?: string | null;
  industryCode?: string | null;
  gicsSector?: string | null;
  gicsIndustryGroup?: string | null;
  gicsIndustry?: string | null;
  gicsSubIndustry?: string | null;
  gicsSubIndustryDescription?: string | null;
};

type GicsExisting = GicsBody;

export function resolveGicsFields(body: GicsBody, existing: GicsExisting) {
  const key =
    body.gicsClassificationKey ??
    body.industryCode ??
    existing.gicsClassificationKey ??
    existing.industryCode;

  const entry = key ? getGicsEntry(key) : undefined;
  if (entry) return gicsToDbFields(entry);

  return {
    gicsSector: body.gicsSector ?? existing.gicsSector ?? null,
    gicsSectorCode: null as string | null,
    gicsIndustryGroup: body.gicsIndustryGroup ?? existing.gicsIndustryGroup ?? null,
    gicsIndustryGroupCode: null as string | null,
    gicsIndustry: body.gicsIndustry ?? existing.gicsIndustry ?? null,
    gicsIndustryCode: null as string | null,
    gicsSubIndustry: body.gicsSubIndustry ?? existing.gicsSubIndustry ?? null,
    gicsSubIndustryCode: null as string | null,
    gicsSubIndustryDescription:
      body.gicsSubIndustryDescription ?? existing.gicsSubIndustryDescription ?? null,
    gicsClassificationKey: key ?? null,
  };
}
