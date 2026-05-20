export type PageParams = {
  limit: number;
  offset: number;
};

export type PageInfo = {
  limit: number;
  offset: number;
  totalCount: number;
  totalPages: number;
  hasMore: boolean;
};

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;

export function parsePageParams(
  searchParams: URLSearchParams,
  defaultLimit = DEFAULT_LIMIT
): PageParams {
  const rawLimit = Number(searchParams.get("limit") ?? defaultLimit);
  const rawOffset = Number(searchParams.get("offset") ?? 0);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(rawLimit)))
    : defaultLimit;
  const offset = Number.isFinite(rawOffset)
    ? Math.max(0, Math.floor(rawOffset))
    : 0;
  return { limit, offset };
}

export function buildPageInfo(
  totalCount: number,
  { limit, offset }: PageParams
): PageInfo {
  const totalPages = totalCount > 0 ? Math.ceil(totalCount / limit) : 1;
  return {
    limit,
    offset,
    totalCount,
    totalPages,
    hasMore: offset + limit < totalCount,
  };
}

export type SortParams = {
  sortBy: string | null;
  sortDir: "asc" | "desc";
};

export function parseSortParams(
  searchParams: URLSearchParams,
  allowed: readonly string[],
  defaultSort?: { by: string; dir: "asc" | "desc" }
): SortParams {
  const rawBy = searchParams.get("sortBy")?.trim() ?? defaultSort?.by ?? null;
  const sortBy =
    rawBy && allowed.includes(rawBy) ? rawBy : defaultSort?.by ?? null;
  const rawDir = searchParams.get("sortDir")?.toLowerCase();
  const sortDir =
    rawDir === "desc" ? "desc" : rawDir === "asc" ? "asc" : (defaultSort?.dir ?? "asc");
  return { sortBy, sortDir };
}
