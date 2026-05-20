/**
 * Shared firmographic option sets surfaced in both the lead edit drawers
 * and the lead workspace filters. Keeping these in one place ensures the
 * filter picker and the drawer's edit dropdowns always agree on labels.
 *
 * Each label is paired with a numeric range so the API can convert the raw
 * (often AI-extracted) revenue or headcount string in the database into a
 * number and match against the bucket regardless of formatting.
 */

export type NumericRange = {
  /** inclusive lower bound */
  min: number;
  /** inclusive upper bound; null means open-ended */
  max: number | null;
};

export const ANNUAL_REVENUE_BUCKETS: { label: string; range: NumericRange }[] = [
  { label: "Under $300K", range: { min: 0, max: 299_999 } },
  { label: "$300K - $500K", range: { min: 300_000, max: 500_000 } },
  { label: "$500K - $1M", range: { min: 500_001, max: 1_000_000 } },
  { label: "$1M - $10M", range: { min: 1_000_001, max: 10_000_000 } },
  { label: "$10M - $50M", range: { min: 10_000_001, max: 50_000_000 } },
  { label: "$50M - $100M", range: { min: 50_000_001, max: 100_000_000 } },
  { label: "$100M - $500M", range: { min: 100_000_001, max: 500_000_000 } },
  { label: "$500M - $1B", range: { min: 500_000_001, max: 999_999_999 } },
  { label: "$1B+", range: { min: 1_000_000_000, max: null } },
];

export const ANNUAL_REVENUE_OPTIONS = ANNUAL_REVENUE_BUCKETS.map(
  (bucket) => bucket.label
) as readonly string[];

export const HEADCOUNT_BUCKETS: { label: string; range: NumericRange }[] = [
  { label: "1-10", range: { min: 1, max: 10 } },
  { label: "11-50", range: { min: 11, max: 50 } },
  { label: "51-200", range: { min: 51, max: 200 } },
  { label: "201-500", range: { min: 201, max: 500 } },
  { label: "501-1,000", range: { min: 501, max: 1_000 } },
  { label: "1,001-5,000", range: { min: 1_001, max: 5_000 } },
  { label: "5,001-10,000", range: { min: 5_001, max: 10_000 } },
  { label: "10,001+", range: { min: 10_001, max: null } },
];

export const HEADCOUNT_OPTIONS = HEADCOUNT_BUCKETS.map(
  (bucket) => bucket.label
) as readonly string[];

export function getAnnualRevenueRange(label: string): NumericRange | null {
  return (
    ANNUAL_REVENUE_BUCKETS.find((bucket) => bucket.label === label)?.range ??
    null
  );
}

export function getHeadcountRange(label: string): NumericRange | null {
  return (
    HEADCOUNT_BUCKETS.find((bucket) => bucket.label === label)?.range ?? null
  );
}
