"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Building2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CloudUpload,
  Download,
  Factory,
  Filter,
  Globe,
  Search,
  Sparkles,
  Tag,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LeadDetailDrawer } from "@/components/lead-detail-drawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GICS_ENTRIES, GICS_SECTORS } from "@/lib/taxonomy/gics";
import { cn } from "@/lib/utils";
import type { Lead } from "@/lib/db/schema";

const COLUMN_FILTERS = [
  { key: "displayName", label: "Display name" },
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "title", label: "Position" },
  { key: "company", label: "Company" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Office telephone" },
  { key: "mobile", label: "Mobile" },
  { key: "website", label: "Website" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "zipCode", label: "Zip code" },
  { key: "country", label: "Country" },
  { key: "annualRevenue", label: "Annual revenue" },
  { key: "employeeHeadcount", label: "Employee headcount" },
  { key: "gicsSubIndustryDescription", label: "Sub-industry description" },
] as const;

type ColumnKey = (typeof COLUMN_FILTERS)[number]["key"];

type SortDir = "asc" | "desc";

type SortableColumn = {
  key: string;
  label: string;
  accessor: (lead: Lead) => string | number | null | undefined;
};

const SORTABLE_COLUMNS: SortableColumn[] = [
  {
    key: "displayName",
    label: "Display name",
    accessor: (l) => l.displayName ?? l.name,
  },
  { key: "firstName", label: "First name", accessor: (l) => l.firstName },
  { key: "lastName", label: "Last name", accessor: (l) => l.lastName },
  { key: "title", label: "Position", accessor: (l) => l.title },
  { key: "company", label: "Company", accessor: (l) => l.company },
  { key: "email", label: "Email", accessor: (l) => l.email },
  { key: "phone", label: "Office Tel", accessor: (l) => l.phone },
  { key: "mobile", label: "Mobile", accessor: (l) => l.mobile },
  { key: "website", label: "Website", accessor: (l) => l.website },
  { key: "address", label: "Address", accessor: (l) => l.address },
  { key: "city", label: "City", accessor: (l) => l.city },
  { key: "zipCode", label: "Zip", accessor: (l) => l.zipCode },
  { key: "country", label: "Country", accessor: (l) => l.country },
  {
    key: "annualRevenue",
    label: "Annual Revenue",
    accessor: (l) => l.annualRevenue,
  },
  {
    key: "employeeHeadcount",
    label: "Headcount",
    accessor: (l) => l.employeeHeadcount,
  },
  { key: "gicsSector", label: "Sector", accessor: (l) => l.gicsSector },
  {
    key: "gicsIndustryGroup",
    label: "Industry Group",
    accessor: (l) => l.gicsIndustryGroup,
  },
  { key: "gicsIndustry", label: "Industry", accessor: (l) => l.gicsIndustry },
  {
    key: "gicsSubIndustry",
    label: "Sub-Industry",
    accessor: (l) => l.gicsSubIndustry,
  },
  {
    key: "gicsSubIndustryDescription",
    label: "Sub-Industry Description",
    accessor: (l) => l.gicsSubIndustryDescription,
  },
];

type Filters = {
  q: string;
  sector: string;
  industryGroup: string;
  industry: string;
  subIndustry: string;
  columns: Record<ColumnKey, string>;
};

const EMPTY_COLUMNS: Filters["columns"] = COLUMN_FILTERS.reduce(
  (acc, { key }) => ({ ...acc, [key]: "" }),
  {} as Filters["columns"]
);

const EMPTY_FILTERS: Filters = {
  q: "",
  sector: "all",
  industryGroup: "all",
  industry: "all",
  subIndustry: "all",
  columns: { ...EMPTY_COLUMNS },
};

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200] as const;
const DEFAULT_PAGE_SIZE = 25;

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const openLead = useCallback((lead: Lead) => {
    setActiveLead(lead);
    setDrawerOpen(true);
  }, []);

  const handleLeadUpdated = useCallback((updated: Lead) => {
    setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    setActiveLead(updated);
  }, []);

  const handleLeadDeleted = useCallback((id: string) => {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [pushingToCrm, setPushingToCrm] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!bulkMessage) return;
    const t = setTimeout(() => setBulkMessage(null), 4000);
    return () => clearTimeout(t);
  }, [bulkMessage]);

  const exportSelectedCsv = useCallback(() => {
    const rows = leads.filter((l) => selectedIds.has(l.id));
    if (rows.length === 0) return;
    const headers = [
      "displayName",
      "firstName",
      "lastName",
      "title",
      "company",
      "email",
      "phone",
      "mobile",
      "website",
      "address",
      "city",
      "zipCode",
      "country",
      "annualRevenue",
      "employeeHeadcount",
      "gicsSector",
      "gicsIndustryGroup",
      "gicsIndustry",
      "gicsSubIndustry",
      "gicsSubIndustryDescription",
    ] as const;

    const escape = (v: unknown) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const csv = [
      headers.join(","),
      ...rows.map((r) =>
        headers.map((h) => escape(r[h as keyof Lead] as unknown)).join(",")
      ),
    ].join("\n");

    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `aila-leads-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setBulkMessage(`Exported ${rows.length} lead(s) to CSV`);
  }, [leads, selectedIds]);

  const pushToCrm = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setPushingToCrm(true);
    setBulkMessage(null);
    try {
      // TODO: wire up real CRM push endpoint once integration is built
      await new Promise((r) => setTimeout(r, 600));
      setBulkMessage(
        `CRM push not yet configured — would have pushed ${selectedIds.size} lead(s)`
      );
    } finally {
      setPushingToCrm(false);
    }
  }, [selectedIds]);

  const confirmBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkDeleting(true);
    setBulkMessage(null);
    try {
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await fetch(`/api/leads/${id}`, { method: "DELETE" });
            return res.ok ? id : null;
          } catch {
            return null;
          }
        })
      );
      const deleted = results.filter((x): x is string => !!x);
      const failed = ids.length - deleted.length;
      if (deleted.length > 0) {
        const removed = new Set(deleted);
        setLeads((prev) => prev.filter((l) => !removed.has(l.id)));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (const id of deleted) next.delete(id);
          return next;
        });
      }
      setBulkMessage(
        failed === 0
          ? `Deleted ${deleted.length} lead(s)`
          : `Deleted ${deleted.length} lead(s), ${failed} failed`
      );
    } finally {
      setBulkDeleting(false);
      setBulkDeleteConfirm(false);
    }
  }, [selectedIds]);

  useEffect(() => {
    if (selectedIds.size === 0) setBulkDeleteConfirm(false);
  }, [selectedIds]);
  const [sort, setSort] = useState<{ by: string | null; dir: SortDir }>({
    by: null,
    dir: "asc",
  });
  const sortBy = sort.by;
  const sortDir = sort.dir;

  const toggleSort = useCallback((key: string) => {
    setSort((current) => {
      if (current.by !== key) return { by: key, dir: "asc" };
      if (current.dir === "asc") return { by: key, dir: "desc" };
      // Third click on the same column clears sort
      return { by: null, dir: "asc" };
    });
  }, []);

  const toggleSelectOne = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const buildParams = useCallback((f: Filters) => {
    const params = new URLSearchParams();
    if (f.q) params.set("q", f.q);
    if (f.sector && f.sector !== "all") params.set("sector", f.sector);
    if (f.industryGroup && f.industryGroup !== "all")
      params.set("industryGroup", f.industryGroup);
    if (f.industry && f.industry !== "all") params.set("industry", f.industry);
    if (f.subIndustry && f.subIndustry !== "all")
      params.set("subIndustry", f.subIndustry);
    for (const { key } of COLUMN_FILTERS) {
      const value = f.columns[key]?.trim();
      if (value) params.set(key, value);
    }
    return params;
  }, []);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = buildParams(filters);
      const res = await fetch(`/api/leads?${params.toString()}`);
      const data = await res.json();
      if (res.ok) setLeads(data.leads ?? []);
    } finally {
      setLoading(false);
    }
  }, [buildParams, filters]);

  useEffect(() => {
    const t = setTimeout(fetchLeads, 300);
    return () => clearTimeout(t);
  }, [fetchLeads]);

  const industryGroupOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of GICS_ENTRIES) {
      if (filters.sector !== "all" && e.sectorId !== filters.sector) continue;
      if (!seen.has(e.industryGroupId)) {
        seen.set(e.industryGroupId, e.industryGroup);
      }
    }
    return Array.from(seen, ([code, label]) => ({ code, label }));
  }, [filters.sector]);

  const industryOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of GICS_ENTRIES) {
      if (filters.sector !== "all" && e.sectorId !== filters.sector) continue;
      if (
        filters.industryGroup !== "all" &&
        e.industryGroupId !== filters.industryGroup
      )
        continue;
      if (!seen.has(e.industryId)) {
        seen.set(e.industryId, e.industry);
      }
    }
    return Array.from(seen, ([code, label]) => ({ code, label }));
  }, [filters.sector, filters.industryGroup]);

  const subIndustryOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of GICS_ENTRIES) {
      if (filters.sector !== "all" && e.sectorId !== filters.sector) continue;
      if (
        filters.industryGroup !== "all" &&
        e.industryGroupId !== filters.industryGroup
      )
        continue;
      if (filters.industry !== "all" && e.industryId !== filters.industry)
        continue;
      seen.set(e.subIndustryId, e.subIndustry);
    }
    return Array.from(seen, ([code, label]) => ({ code, label }));
  }, [filters.sector, filters.industryGroup, filters.industry]);

  const setQ = (v: string) => setFilters((f) => ({ ...f, q: v }));

  const setSector = (v: string | null) =>
    setFilters((f) => ({
      ...f,
      sector: v ?? "all",
      industryGroup: "all",
      industry: "all",
      subIndustry: "all",
    }));

  const setIndustryGroup = (v: string | null) =>
    setFilters((f) => ({
      ...f,
      industryGroup: v ?? "all",
      industry: "all",
      subIndustry: "all",
    }));

  const setIndustry = (v: string | null) =>
    setFilters((f) => ({
      ...f,
      industry: v ?? "all",
      subIndustry: "all",
    }));

  const setSubIndustry = (v: string | null) =>
    setFilters((f) => ({ ...f, subIndustry: v ?? "all" }));

  const setColumn = (key: ColumnKey, value: string) =>
    setFilters((f) => ({
      ...f,
      columns: { ...f.columns, [key]: value },
    }));

  const activePills = useMemo(() => {
    const pills: { id: string; label: string; clear: () => void }[] = [];
    if (filters.q)
      pills.push({
        id: "q",
        label: `Search: ${filters.q}`,
        clear: () => setQ(""),
      });
    if (filters.sector !== "all") {
      const s = GICS_SECTORS.find((x) => x.code === filters.sector);
      pills.push({
        id: "sector",
        label: `Sector: ${s?.name ?? filters.sector}`,
        clear: () => setSector("all"),
      });
    }
    if (filters.industryGroup !== "all") {
      const ig = industryGroupOptions.find(
        (x) => x.code === filters.industryGroup
      );
      pills.push({
        id: "ig",
        label: `Group: ${ig?.label ?? filters.industryGroup}`,
        clear: () => setIndustryGroup("all"),
      });
    }
    if (filters.industry !== "all") {
      const i = industryOptions.find((x) => x.code === filters.industry);
      pills.push({
        id: "industry",
        label: `Industry: ${i?.label ?? filters.industry}`,
        clear: () => setIndustry("all"),
      });
    }
    if (filters.subIndustry !== "all") {
      const si = subIndustryOptions.find(
        (x) => x.code === filters.subIndustry
      );
      pills.push({
        id: "sub",
        label: `Sub-industry: ${si?.label ?? filters.subIndustry}`,
        clear: () => setSubIndustry("all"),
      });
    }
    for (const { key, label } of COLUMN_FILTERS) {
      const value = filters.columns[key];
      if (value) {
        pills.push({
          id: `col-${key}`,
          label: `${label}: ${value}`,
          clear: () => setColumn(key, ""),
        });
      }
    }
    return pills;
  }, [
    filters,
    industryGroupOptions,
    industryOptions,
    subIndustryOptions,
  ]);

  const leadStats = useMemo(() => {
    const total = leads.length;
    const industries = new Set(
      leads.map((l) => l.gicsIndustryCode).filter((c): c is string => !!c)
    ).size;
    const subIndustries = new Set(
      leads.map((l) => l.gicsSubIndustryCode).filter((c): c is string => !!c)
    ).size;
    const companies = new Set(
      leads
        .map((l) => l.company?.trim().toLowerCase())
        .filter((c): c is string => !!c)
    ).size;
    const countries = new Set(
      leads
        .map((l) => l.country?.trim().toLowerCase())
        .filter((c): c is string => !!c)
    ).size;
    const enrichedAndClassified = leads.filter(
      (l) =>
        l.enrichmentStatus === "enriched" &&
        (l.gicsSectorCode || l.gicsClassificationKey)
    ).length;

    return {
      total,
      industries,
      subIndustries,
      companies,
      countries,
      enrichedAndClassified,
    };
  }, [leads]);

  const hasActiveFilters = activePills.length > 0;
  const clearAll = () => setFilters(EMPTY_FILTERS);

  useEffect(() => {
    setPage(1);
  }, [filters, pageSize, sortBy, sortDir]);

  const sortedLeads = useMemo(() => {
    if (!sortBy) return leads;
    const col = SORTABLE_COLUMNS.find((c) => c.key === sortBy);
    if (!col) return leads;
    const dirMul = sortDir === "asc" ? 1 : -1;
    const norm = (v: string | number | null | undefined) => {
      if (v === null || v === undefined) return null;
      if (typeof v === "number") return v;
      const s = String(v).trim();
      return s ? s : null;
    };
    const copy = [...leads];
    copy.sort((a, b) => {
      const av = norm(col.accessor(a));
      const bv = norm(col.accessor(b));
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dirMul;
      }
      return (
        String(av).localeCompare(String(bv), undefined, {
          numeric: true,
          sensitivity: "base",
        }) * dirMul
      );
    });
    return copy;
  }, [leads, sortBy, sortDir]);

  const totalLeads = sortedLeads.length;
  const totalPages = Math.max(1, Math.ceil(totalLeads / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = totalLeads === 0 ? 0 : (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalLeads);
  const pagedLeads = useMemo(
    () => sortedLeads.slice(startIndex, endIndex),
    [sortedLeads, startIndex, endIndex]
  );
  const canPrev = safePage > 1;
  const canNext = safePage < totalPages;

  useEffect(() => {
    if (selectedIds.size === 0) return;
    const visibleIds = new Set(leads.map((l) => l.id));
    let changed = false;
    const next = new Set<string>();
    for (const id of selectedIds) {
      if (visibleIds.has(id)) next.add(id);
      else changed = true;
    }
    if (changed) setSelectedIds(next);
  }, [leads, selectedIds]);

  const allPageSelected =
    pagedLeads.length > 0 &&
    pagedLeads.every((l) => selectedIds.has(l.id));
  const somePageSelected =
    pagedLeads.some((l) => selectedIds.has(l.id)) && !allPageSelected;

  const togglePageSelection = useCallback(
    (checked: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const lead of pagedLeads) {
          if (checked) next.add(lead.id);
          else next.delete(lead.id);
        }
        return next;
      });
    },
    [pagedLeads]
  );

  const selectAllFiltered = useCallback(() => {
    setSelectedIds(new Set(leads.map((l) => l.id)));
  }, [leads]);

  const selectionCount = selectedIds.size;
  const allFilteredSelected =
    leads.length > 0 && selectionCount === leads.length;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Workspace
        </p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">Leads</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Approved contacts from all your imports, deduplicated and tagged
              with GICS sector, industry group, industry, and sub-industry.
            </p>
          </div>
          {hasActiveFilters && (
            <p className="text-xs text-muted-foreground">
              Stats reflect your active filters
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Total leads"
          value={leadStats.total}
          tone="brand"
        />
        <StatCard
          icon={<Factory className="h-4 w-4" />}
          label="Industry"
          value={leadStats.industries}
          tone="muted"
        />
        <StatCard
          icon={<Tag className="h-4 w-4" />}
          label="Sub Industry"
          value={leadStats.subIndustries}
          tone="muted"
        />
        <StatCard
          icon={<Building2 className="h-4 w-4" />}
          label="Companies"
          value={leadStats.companies}
          tone="brand"
        />
        <StatCard
          icon={<Globe className="h-4 w-4" />}
          label="Countries"
          value={leadStats.countries}
          tone="success"
        />
        <StatCard
          icon={<Sparkles className="h-4 w-4" />}
          label="AI Enriched & Classified"
          value={leadStats.enrichedAndClassified}
          tone="success"
          detail={
            leadStats.total > 0
              ? `${Math.round((leadStats.enrichedAndClassified / leadStats.total) * 100)}% of view`
              : undefined
          }
        />
      </div>

      <section className="app-panel">
        <div className="app-panel-body space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-12">
            <FilterField id="filter-q" label="Search" className="xl:col-span-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="filter-q"
                  placeholder="Search any column…"
                  value={filters.q}
                  onChange={(e) => setQ(e.target.value)}
                  className="pl-9"
                />
              </div>
            </FilterField>

            <FilterField
              id="filter-sector"
              label="Sector"
              className="xl:col-span-2"
            >
              <Select value={filters.sector} onValueChange={setSector}>
                <SelectTrigger id="filter-sector" className="w-full">
                  <SelectValue>
                    {(value) =>
                      !value || value === "all"
                        ? "Select sector"
                        : GICS_SECTORS.find((s) => s.code === value)?.name ??
                          "Select sector"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent
                  alignItemWithTrigger={false}
                  className="w-auto min-w-[var(--anchor-width)] max-w-[460px]"
                >
                  <SelectItem value="all">All sectors</SelectItem>
                  {GICS_SECTORS.map((s) => (
                    <SelectItem key={s.code} value={s.code}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>

            <FilterField
              id="filter-group"
              label="Industry group"
              className="xl:col-span-2"
            >
              <Select
                value={filters.industryGroup}
                onValueChange={setIndustryGroup}
                disabled={industryGroupOptions.length === 0}
              >
                <SelectTrigger id="filter-group" className="w-full">
                  <SelectValue>
                    {(value) =>
                      !value || value === "all"
                        ? "Select industry group"
                        : industryGroupOptions.find((o) => o.code === value)
                            ?.label ?? "Select industry group"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent
                  alignItemWithTrigger={false}
                  className="w-auto min-w-[var(--anchor-width)] max-w-[460px]"
                >
                  <SelectItem value="all">All groups</SelectItem>
                  {industryGroupOptions.map((o) => (
                    <SelectItem key={o.code} value={o.code}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>

            <FilterField
              id="filter-industry"
              label="Industry"
              className="xl:col-span-2"
            >
              <Select
                value={filters.industry}
                onValueChange={setIndustry}
                disabled={industryOptions.length === 0}
              >
                <SelectTrigger id="filter-industry" className="w-full">
                  <SelectValue>
                    {(value) =>
                      !value || value === "all"
                        ? "Select industry"
                        : industryOptions.find((o) => o.code === value)
                            ?.label ?? "Select industry"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent
                  alignItemWithTrigger={false}
                  className="w-auto min-w-[var(--anchor-width)] max-w-[460px]"
                >
                  <SelectItem value="all">All industries</SelectItem>
                  {industryOptions.map((o) => (
                    <SelectItem key={o.code} value={o.code}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>

            <FilterField
              id="filter-sub"
              label="Sub-industry"
              className="xl:col-span-2"
            >
              <Select
                value={filters.subIndustry}
                onValueChange={setSubIndustry}
                disabled={subIndustryOptions.length === 0}
              >
                <SelectTrigger id="filter-sub" className="w-full">
                  <SelectValue>
                    {(value) =>
                      !value || value === "all"
                        ? "Select sub-industry"
                        : subIndustryOptions.find((o) => o.code === value)
                            ?.label ?? "Select sub-industry"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent
                  alignItemWithTrigger={false}
                  className="w-auto min-w-[var(--anchor-width)] max-w-[460px]"
                >
                  <SelectItem value="all">All sub-industries</SelectItem>
                  {subIndustryOptions.map((o) => (
                    <SelectItem key={o.code} value={o.code}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>

            <FilterField label="" className="xl:col-span-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAdvanced((v) => !v)}
                aria-expanded={showAdvanced}
                className="w-full"
              >
                <Filter className="h-4 w-4" />
                {showAdvanced ? "Hide" : "More"}
              </Button>
            </FilterField>
          </div>

          {showAdvanced && (
            <div className="grid grid-cols-1 gap-3 rounded-md border border-border/70 bg-muted/30 p-4 sm:grid-cols-2 lg:grid-cols-4">
              {COLUMN_FILTERS.map(({ key, label }) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`filter-${key}`} className="text-xs">
                    {label}
                  </Label>
                  <Input
                    id={`filter-${key}`}
                    value={filters.columns[key]}
                    onChange={(e) => setColumn(key, e.target.value)}
                    placeholder={`Filter ${label.toLowerCase()}…`}
                  />
                </div>
              ))}
            </div>
          )}

          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2">
              {activePills.map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={pill.clear}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card px-2.5 py-0.5 text-xs text-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive"
                >
                  {pill.label}
                  <X className="h-3 w-3" />
                </button>
              ))}
              <button
                type="button"
                onClick={clearAll}
                className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-3 border-t border-border/70 px-6 py-2.5 text-sm transition-colors"
          )}
          style={
            selectionCount > 0
              ? {
                  background:
                    "color-mix(in oklab, var(--brand-marigold) 10%, transparent)",
                }
              : undefined
          }
        >
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            {selectionCount > 0 ? (
              <>
                <span className="brand-pill">
                  <Users className="h-3 w-3" />
                  {selectionCount} Selected
                </span>
                {!allFilteredSelected && leads.length > selectionCount && (
                  <button
                    type="button"
                    onClick={selectAllFiltered}
                    className="text-xs font-medium text-foreground/80 underline-offset-2 hover:text-foreground hover:underline"
                  >
                    Select all {leads.length} leads in view
                  </button>
                )}
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  Clear
                </button>
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                <Users className="h-3 w-3" />
                0 Selected
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={exportSelectedCsv}
              disabled={selectionCount === 0}
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={pushToCrm}
              disabled={selectionCount === 0 || pushingToCrm}
            >
              <CloudUpload className="h-3.5 w-3.5" />
              {pushingToCrm ? "Pushing…" : "Push to CRM"}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setBulkDeleteConfirm(true)}
              disabled={selectionCount === 0 || bulkDeleting}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        </div>

        {bulkDeleteConfirm && selectionCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-destructive/30 bg-destructive/5 px-6 py-2.5 text-sm">
            <span className="text-foreground">
              Delete {selectionCount} selected lead{selectionCount === 1 ? "" : "s"}?
              This cannot be undone.
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBulkDeleteConfirm(false)}
                disabled={bulkDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => void confirmBulkDelete()}
                disabled={bulkDeleting}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {bulkDeleting ? "Deleting…" : `Delete ${selectionCount}`}
              </Button>
            </div>
          </div>
        )}

        {bulkMessage && (
          <div className="border-t border-border/70 bg-muted/40 px-6 py-2 text-xs text-muted-foreground">
            {bulkMessage}
          </div>
        )}

        <div className="-mt-px border-t border-border/70">
          {loading ? (
            <p className="px-6 py-8 text-sm text-muted-foreground">Loading…</p>
          ) : leads.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">
              No leads match the current filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        aria-label={
                          allPageSelected ? "Deselect page" : "Select page"
                        }
                        checked={allPageSelected}
                        indeterminate={somePageSelected}
                        onCheckedChange={togglePageSelection}
                      />
                    </TableHead>
                    {SORTABLE_COLUMNS.map((col) => (
                      <TableHead key={col.key}>
                        <SortHeader
                          label={col.label}
                          active={sortBy === col.key}
                          direction={sortBy === col.key ? sortDir : null}
                          onClick={() => toggleSort(col.key)}
                        />
                      </TableHead>
                    ))}
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedLeads.map((lead) => {
                    const isSelected = selectedIds.has(lead.id);
                    return (
                    <TableRow
                      key={lead.id}
                      data-state={isSelected ? "selected" : undefined}
                      onClick={() => openLead(lead)}
                      className={cn(
                        "cursor-pointer",
                        isSelected &&
                          "bg-[color:color-mix(in_oklab,var(--brand-marigold)_8%,transparent)]"
                      )}
                    >
                      <TableCell
                        className="w-10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          aria-label={
                            isSelected ? "Deselect lead" : "Select lead"
                          }
                          checked={isSelected}
                          onCheckedChange={(c) => toggleSelectOne(lead.id, c)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {lead.displayName ?? lead.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {lead.firstName ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {lead.lastName ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {lead.title ?? "—"}
                      </TableCell>
                      <TableCell>{lead.company ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {lead.email ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {lead.phone ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {lead.mobile ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {lead.website ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {lead.address ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {lead.city ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {lead.zipCode ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {lead.country ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {lead.annualRevenue ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {lead.employeeHeadcount ?? "—"}
                      </TableCell>
                      <TableCell>{lead.gicsSector ?? "—"}</TableCell>
                      <TableCell>{lead.gicsIndustryGroup ?? "—"}</TableCell>
                      <TableCell>{lead.gicsIndustry ?? "—"}</TableCell>
                      <TableCell>{lead.gicsSubIndustry ?? "—"}</TableCell>
                      <TableCell
                        className="max-w-[260px] truncate text-muted-foreground"
                        title={lead.gicsSubIndustryDescription ?? undefined}
                      >
                        {lead.gicsSubIndustryDescription ?? "—"}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {lead.sourceExtractedLeadId ? (
                          <Link
                            href={`/imports`}
                            className="text-sm text-primary hover:underline"
                            title={lead.sourceExtractedLeadId}
                          >
                            View import
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {totalLeads > 0 && !loading && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 px-6 py-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="text-xs uppercase tracking-[0.14em]">
                Rows per page
              </span>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => v && setPageSize(Number(v))}
              >
                <SelectTrigger className="h-8 w-[84px]">
                  <SelectValue>{(v) => v ?? String(pageSize)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <span className="text-xs text-muted-foreground tabular-nums">
                {startIndex + 1}–{endIndex} of {totalLeads}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                Page {safePage} / {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPage(1)}
                  disabled={!canPrev}
                  aria-label="First page"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={!canPrev}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={!canNext}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPage(totalPages)}
                  disabled={!canNext}
                  aria-label="Last page"
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </section>

      <LeadDetailDrawer
        lead={activeLead}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onUpdate={handleLeadUpdated}
        onDelete={handleLeadDeleted}
      />
    </div>
  );
}

function SortHeader({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: SortDir | null;
  onClick: () => void;
}) {
  const Icon =
    active && direction === "asc"
      ? ArrowUp
      : active && direction === "desc"
        ? ArrowDown
        : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-sort={
        !active ? "none" : direction === "asc" ? "ascending" : "descending"
      }
      className={cn(
        "group/sort -mx-1.5 inline-flex h-8 items-center gap-1.5 rounded-md px-1.5 text-left text-[13px] font-semibold uppercase tracking-[0.06em] transition-colors",
        active
          ? "bg-[color:color-mix(in_oklab,var(--brand-marigold)_18%,transparent)] text-foreground"
          : "text-foreground/80 hover:bg-[color:color-mix(in_oklab,var(--brand-green)_6%,transparent)] hover:text-foreground"
      )}
    >
      <span>{label}</span>
      <Icon
        className={cn(
          "h-3.5 w-3.5 transition-opacity",
          active
            ? "opacity-100 text-[color:color-mix(in_oklab,var(--brand-green)_70%,black)]"
            : "opacity-35 group-hover/sort:opacity-90"
        )}
      />
    </button>
  );
}

type StatTone = "brand" | "success" | "muted" | "danger";

function StatCard({
  icon,
  label,
  value,
  tone,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: StatTone;
  detail?: string;
}) {
  const toneStyles: Record<StatTone, { bg: string; fg: string }> = {
    brand: {
      bg: "color-mix(in oklab, var(--brand-marigold) 18%, transparent)",
      fg: "color-mix(in oklab, var(--brand-green) 80%, black)",
    },
    success: {
      bg: "color-mix(in oklab, var(--success) 14%, transparent)",
      fg: "color-mix(in oklab, var(--success) 65%, black)",
    },
    muted: {
      bg: "color-mix(in oklab, var(--muted-foreground) 12%, transparent)",
      fg: "var(--muted-foreground)",
    },
    danger: {
      bg: "color-mix(in oklab, var(--destructive) 12%, transparent)",
      fg: "var(--destructive)",
    },
  };
  const t = toneStyles[tone];

  return (
    <div className="app-stat flex items-center gap-3">
      <span
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
        style={{ background: t.bg, color: t.fg }}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </div>
        <div className="text-xl font-semibold tabular-nums">{value}</div>
        {detail ? (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{detail}</p>
        ) : null}
      </div>
    </div>
  );
}

function FilterField({
  id,
  label,
  children,
  className,
}: {
  id?: string;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <Label
          htmlFor={id}
          className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground"
        >
          {label}
        </Label>
      ) : (
        <span aria-hidden className="block h-[14px]" />
      )}
      {children}
    </div>
  );
}
