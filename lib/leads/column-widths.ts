/**
 * Per-column width hints shared by the extracted leads table and the main
 * leads workspace table. We pair a `min-w-*` on the `<th>` (so the column
 * has a stable baseline width) with a `max-w-*` + `truncate` on the inner
 * cell wrapper (so very long values clip with an ellipsis instead of
 * stretching the row).
 */
export const LEAD_COLUMN_HEAD = {
  displayName: "min-w-[200px]",
  firstName: "min-w-[120px]",
  lastName: "min-w-[120px]",
  title: "min-w-[180px]",
  company: "min-w-[200px]",
  email: "min-w-[220px]",
  phone: "min-w-[140px]",
  mobile: "min-w-[140px]",
  website: "min-w-[200px]",
  address: "min-w-[220px]",
  city: "min-w-[140px]",
  zipCode: "min-w-[96px]",
  country: "min-w-[120px]",
  annualRevenue: "min-w-[140px]",
  employeeHeadcount: "min-w-[120px]",
  gicsSector: "min-w-[160px]",
  gicsIndustryGroup: "min-w-[180px]",
  gicsIndustry: "min-w-[180px]",
  gicsSubIndustry: "min-w-[180px]",
  gicsSubIndustryDescription: "min-w-[240px] max-w-[320px]",
  confidence: "w-[110px]",
  status: "w-[110px]",
  source: "w-[200px]",
} as const;

export const LEAD_COLUMN_CELL = {
  displayName: "max-w-[220px] truncate",
  firstName: "max-w-[140px] truncate",
  lastName: "max-w-[140px] truncate",
  title: "max-w-[220px] truncate",
  company: "max-w-[240px] truncate",
  email: "max-w-[260px] truncate",
  phone: "max-w-[160px] truncate",
  mobile: "max-w-[160px] truncate",
  website: "max-w-[240px] truncate",
  address: "max-w-[260px] truncate",
  city: "max-w-[160px] truncate",
  zipCode: "max-w-[120px] truncate",
  country: "max-w-[140px] truncate",
  annualRevenue: "max-w-[160px] truncate",
  employeeHeadcount: "max-w-[140px] truncate",
  gicsSector: "max-w-[200px] truncate",
  gicsIndustryGroup: "max-w-[220px] truncate",
  gicsIndustry: "max-w-[220px] truncate",
  gicsSubIndustry: "max-w-[220px] truncate",
  gicsSubIndustryDescription: "max-w-[320px] truncate",
  source: "max-w-[220px]",
} as const;

export type LeadColumnKey = keyof typeof LEAD_COLUMN_HEAD;
