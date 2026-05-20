"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ConfidenceBadge } from "@/components/confidence-badge";
import { ExtractedLeadDetailDrawer } from "@/components/extracted-lead-detail-drawer";
import {
  LEAD_COLUMN_CELL,
  LEAD_COLUMN_HEAD,
} from "@/lib/leads/column-widths";
import type { ExtractedLead } from "@/lib/db/schema";

function TruncCell({
  value,
  className,
  emphasize,
}: {
  value: string | null | undefined;
  className: string;
  emphasize?: boolean;
}) {
  const display = value?.trim();
  return (
    <TableCell className={emphasize ? undefined : "text-muted-foreground"}>
      <div
        className={cn("block truncate", className)}
        title={display || undefined}
      >
        {display || "—"}
      </div>
    </TableCell>
  );
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200] as const;
const DEFAULT_PAGE_SIZE = 10;
const LOW_CONFIDENCE_THRESHOLD = 0.6;

export type ExtractedLeadServerPagination = {
  totalCount: number;
  offset: number;
  limit: number;
  loading?: boolean;
  lowConfidenceCount: number;
  rejectedCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onLowConfidenceOnlyChange: (value: boolean) => void;
  onRejectedOnlyChange: (value: boolean) => void;
};

type Props = {
  leads: ExtractedLead[];
  importId: string;
  /** When set, pagination/filter counts come from the server (large imports). */
  serverPagination?: ExtractedLeadServerPagination;
  /**
   * True while the import is still saving rows to the database or while any
   * lead is still being AI-enriched. While this is true the rows are blurred
   * + animated and all per-row interactions (click, checkbox, review link)
   * are disabled.
   */
  isProcessing?: boolean;
  /** Called after a successful bulk approve/reject so the parent can refresh. */
  onLeadsChanged?: () => void;
};

function getConfidence(lead: ExtractedLead): number {
  const value = lead.confidence;
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "string" ? parseFloat(value) : value;
  return Number.isFinite(parsed) ? parsed : 0;
}

const CSV_HEADERS = [
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
  "reviewStatus",
  "enrichmentStatus",
  "confidence",
  "pageNumber",
] as const;

function escapeCsv(v: unknown) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function ExtractedLeadTable({
  leads,
  importId,
  serverPagination,
  isProcessing = false,
  onLeadsChanged,
}: Props) {
  const remote = !!serverPagination;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [lowConfidenceOnly, setLowConfidenceOnly] = useState(false);
  const [rejectedOnly, setRejectedOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);
  const [bulkRejecting, setBulkRejecting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{
    action: "approve" | "reject";
    done: number;
    total: number;
  } | null>(null);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [activeLead, setActiveLead] = useState<ExtractedLead | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const onServerPageChange = serverPagination?.onPageChange;
  const onServerLowConfidenceOnlyChange =
    serverPagination?.onLowConfidenceOnlyChange;
  const onServerRejectedOnlyChange = serverPagination?.onRejectedOnlyChange;

  // Snap back to page 1 when page size changes. Don't reset on `leads`
  // changes — the import detail page polls every 3s while extraction is
  // in flight and we don't want to bounce the user back.
  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  // Filter changes should feel like a fresh view, not carry hidden selections.
  useEffect(() => {
    if (remote) {
      onServerLowConfidenceOnlyChange?.(lowConfidenceOnly);
      onServerPageChange?.(1);
    } else {
      setPage(1);
    }
    setSelectedIds(new Set());
  }, [
    lowConfidenceOnly,
    remote,
    onServerLowConfidenceOnlyChange,
    onServerPageChange,
  ]);

  useEffect(() => {
    if (remote) {
      onServerRejectedOnlyChange?.(rejectedOnly);
      onServerPageChange?.(1);
    } else {
      setPage(1);
    }
    setSelectedIds(new Set());
  }, [rejectedOnly, remote, onServerRejectedOnlyChange, onServerPageChange]);

  // Auto-dismiss bulk-action toast.
  useEffect(() => {
    if (!bulkMessage) return;
    const t = setTimeout(() => setBulkMessage(null), 4000);
    return () => clearTimeout(t);
  }, [bulkMessage]);

  // Prune selection of IDs that have disappeared (e.g. import deleted).
  // In server-paginated mode the current `leads` array is only one page, so
  // pruning here would immediately undo "select all" across pages.
  useEffect(() => {
    if (remote) return;
    if (selectedIds.size === 0) return;
    const visible = new Set(leads.map((l) => l.id));
    let changed = false;
    const next = new Set<string>();
    for (const id of selectedIds) {
      if (visible.has(id)) next.add(id);
      else changed = true;
    }
    if (changed) setSelectedIds(next);
  }, [leads, remote, selectedIds]);

  // Keep the drawer's lead in sync with refetched data. While the import
  // detail page polls every 3s, the parent passes us a fresh `leads` array;
  // we re-look up by ID so the drawer reflects the latest values without
  // having to close + reopen.
  useEffect(() => {
    if (!activeLead) return;
    const fresh = leads.find((l) => l.id === activeLead.id);
    if (fresh && fresh !== activeLead) setActiveLead(fresh);
  }, [leads, activeLead]);

  const openLead = useCallback(
    (lead: ExtractedLead) => {
      if (isProcessing) return;
      setActiveLead(lead);
      setDrawerOpen(true);
    },
    [isProcessing]
  );

  // While processing, any open drawer/selection are stale and confusing.
  useEffect(() => {
    if (!isProcessing) return;
    setDrawerOpen(false);
    setSelectedIds(new Set());
  }, [isProcessing]);

  const handleLeadUpdated = useCallback(
    (updated: ExtractedLead) => {
      setActiveLead(updated);
      onLeadsChanged?.();
    },
    [onLeadsChanged]
  );

  const lowConfidenceCount = remote
    ? (serverPagination?.lowConfidenceCount ?? 0)
    : leads.filter(
        (lead) =>
          lead.reviewStatus !== "rejected" &&
          getConfidence(lead) < LOW_CONFIDENCE_THRESHOLD
      ).length;
  const rejectedCount = remote
    ? (serverPagination?.rejectedCount ?? 0)
    : leads.filter((lead) => lead.reviewStatus === "rejected").length;

  const totalExtractedLeads = remote
    ? (serverPagination?.totalCount ?? 0)
    : leads.length;
  const totalLeads = remote
    ? totalExtractedLeads
    : rejectedOnly
      ? leads.filter((l) => l.reviewStatus === "rejected").length
      : lowConfidenceOnly
        ? leads.filter(
            (l) =>
              l.reviewStatus !== "rejected" &&
              getConfidence(l) < LOW_CONFIDENCE_THRESHOLD
          ).length
        : leads.filter((l) => l.reviewStatus !== "rejected").length;

  const activePageSize = remote
    ? (serverPagination?.limit ?? pageSize)
    : pageSize;
  const activePage = remote
    ? Math.floor((serverPagination?.offset ?? 0) / activePageSize) + 1
    : page;

  const totalPages = Math.max(1, Math.ceil(totalLeads / activePageSize));
  const safePage = Math.min(activePage, totalPages);
  const startIndex = totalLeads === 0 ? 0 : (safePage - 1) * activePageSize;
  const endIndex = Math.min(startIndex + activePageSize, totalLeads);
  const canPrev = safePage > 1;
  const canNext = safePage < totalPages;

  const pagedLeads = useMemo(
    () => {
      if (remote) return leads;
      const filtered = rejectedOnly
        ? leads.filter((lead) => lead.reviewStatus === "rejected")
        : lowConfidenceOnly
          ? leads.filter(
              (lead) =>
                lead.reviewStatus !== "rejected" &&
                getConfidence(lead) < LOW_CONFIDENCE_THRESHOLD
            )
          : leads.filter((lead) => lead.reviewStatus !== "rejected");
      return filtered.slice(startIndex, endIndex);
    },
    [remote, leads, rejectedOnly, lowConfidenceOnly, startIndex, endIndex]
  );

  const setPageSafe = useCallback(
    (next: number) => {
      if (remote) serverPagination?.onPageChange(next);
      else setPage(next);
    },
    [remote, serverPagination]
  );

  const setPageSizeSafe = useCallback(
    (size: number) => {
      if (remote) serverPagination?.onPageSizeChange(size);
      else setPageSize(size);
    },
    [remote, serverPagination]
  );

  const toggleSelectOne = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const isSelectableLead = useCallback(
    (lead: ExtractedLead) =>
      rejectedOnly
        ? lead.reviewStatus === "rejected"
        : lead.reviewStatus !== "rejected",
    [rejectedOnly]
  );

  const togglePageSelection = useCallback(
    (checked: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const lead of pagedLeads.filter(isSelectableLead)) {
          if (checked) next.add(lead.id);
          else next.delete(lead.id);
        }
        return next;
      });
    },
    [isSelectableLead, pagedLeads]
  );

  const selectAll = useCallback(async () => {
    if (remote) {
      const params = new URLSearchParams({ idsOnly: "true" });
      if (rejectedOnly) {
        params.set("reviewStatus", "rejected");
      } else {
        params.set("excludeRejected", "true");
        if (lowConfidenceOnly) params.set("lowConfidenceOnly", "true");
      }
      const res = await fetch(`/api/imports/${importId}/leads?${params}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.ids)) {
        setSelectedIds(new Set(data.ids));
      }
      return;
    }

    const selectableLeads = leads.filter((lead) =>
      rejectedOnly
        ? lead.reviewStatus === "rejected"
        : lead.reviewStatus !== "rejected"
    );
    setSelectedIds(new Set(selectableLeads.map((l) => l.id)));
  }, [importId, leads, lowConfidenceOnly, rejectedOnly, remote]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selectablePageLeads = pagedLeads.filter(isSelectableLead);
  const allPageSelected =
    selectablePageLeads.length > 0 &&
    selectablePageLeads.every((l) => selectedIds.has(l.id));
  const somePageSelected =
    selectablePageLeads.some((l) => selectedIds.has(l.id)) && !allPageSelected;
  const selectionCount = selectedIds.size;
  const selectableTotal = remote
    ? totalLeads
    : leads.filter(isSelectableLead).length;
  const allSelected =
    selectableTotal > 0 && selectionCount >= selectableTotal;
  const bulkProgressPct =
    bulkProgress && bulkProgress.total > 0
      ? Math.min(
          100,
          Math.round((bulkProgress.done / bulkProgress.total) * 100)
        )
      : 0;

  const exportSelectedCsv = useCallback(() => {
    const rows = leads.filter((l) => selectedIds.has(l.id));
    if (rows.length === 0) return;
    const csv = [
      CSV_HEADERS.join(","),
      ...rows.map((r) =>
        CSV_HEADERS.map((h) =>
          escapeCsv(r[h as keyof ExtractedLead] as unknown)
        ).join(",")
      ),
    ].join("\n");
    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `aila-extracted-leads-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setBulkMessage(`Exported ${rows.length} lead(s) to CSV`);
  }, [leads, selectedIds]);

  const runBulk = useCallback(
    async (action: "approve" | "reject") => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;
      if (action === "approve") setBulkApproving(true);
      else setBulkRejecting(true);
      setBulkProgress({ action, done: 0, total: ids.length });
      setBulkMessage(null);
      try {
        const results = await Promise.all(
          ids.map(async (id) => {
            try {
              const res = await fetch(
                `/api/extracted-leads/${id}/${action}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: "{}",
                }
              );
              return res.ok;
            } catch {
              return false;
            } finally {
              setBulkProgress((current) =>
                current?.action === action
                  ? {
                      ...current,
                      done: Math.min(current.done + 1, current.total),
                    }
                  : current
              );
            }
          })
        );
        const ok = results.filter(Boolean).length;
        const fail = results.length - ok;
        setBulkMessage(
          fail === 0
            ? `${action === "approve" ? "Approved" : "Rejected"} ${ok} lead(s)`
            : `${action === "approve" ? "Approved" : "Rejected"} ${ok}, ${fail} failed`
        );
        if (ok > 0) {
          setSelectedIds(new Set());
          onLeadsChanged?.();
        }
      } finally {
        if (action === "approve") setBulkApproving(false);
        else setBulkRejecting(false);
        setBulkProgress(null);
      }
    },
    [selectedIds, onLeadsChanged]
  );

  if (!remote && totalExtractedLeads === 0) {
    return (
      <p className="px-6 py-10 text-center text-sm text-muted-foreground">
        No extracted leads yet. Processing may still be in progress.
      </p>
    );
  }

  if (serverPagination?.loading && leads.length === 0) {
    return (
      <p className="px-6 py-10 text-center text-sm text-muted-foreground">
        Loading leads…
      </p>
    );
  }

  return (
    <>
      <div
        className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-6 py-2.5 text-sm transition-colors"
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
          {isProcessing ? (
            <span className="ai-pill">
              <Sparkles className="ai-pulse-icon h-3 w-3" />
              <span>
                Processing<span className="ai-dots" aria-hidden />
              </span>
              <span className="text-[10px] font-normal opacity-80">
                · leads unlock when ready
              </span>
            </span>
          ) : selectionCount > 0 ? (
            <>
              <span className="brand-pill">
                <Users className="h-3 w-3" />
                {selectionCount} Selected
              </span>
              {!allSelected && selectableTotal > selectionCount && (
                <button
                  type="button"
                  onClick={() => void selectAll()}
                  className="text-xs font-medium text-foreground/80 underline-offset-2 hover:text-foreground hover:underline"
                >
                  Select all {selectableTotal} leads
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
          {!isProcessing && (
            <>
              <button
                type="button"
                onClick={() => {
                  setRejectedOnly(false);
                  setLowConfidenceOnly((value) => !value);
                }}
                disabled={lowConfidenceCount === 0}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  lowConfidenceOnly && !rejectedOnly
                    ? "border-[var(--brand-marigold)] bg-[var(--brand-marigold)] text-foreground"
                    : "border-border/70 bg-background text-muted-foreground hover:border-warning/50 hover:text-foreground",
                  lowConfidenceCount === 0 &&
                    "cursor-not-allowed opacity-50 hover:border-border/70 hover:text-muted-foreground"
                )}
                title="Show only extracted leads below 60% confidence"
              >
                <AlertTriangle
                  className={cn(
                    "h-3.5 w-3.5",
                    lowConfidenceOnly && !rejectedOnly
                      ? "text-white"
                      : "text-warning"
                  )}
                />
                Needs review
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                  {lowConfidenceCount}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setLowConfidenceOnly(false);
                  setRejectedOnly((value) => !value);
                }}
                disabled={rejectedCount === 0}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  rejectedOnly
                    ? "border-destructive/50 bg-destructive/10 text-foreground"
                    : "border-border/70 bg-background text-muted-foreground hover:border-destructive/50 hover:text-foreground",
                  rejectedCount === 0 &&
                    "cursor-not-allowed opacity-50 hover:border-border/70 hover:text-muted-foreground"
                )}
                title="Show rejected extracted leads"
              >
                <X className="h-3.5 w-3.5 text-destructive" />
                Rejected
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                  {rejectedCount}
                </span>
              </button>
            </>
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
            onClick={() => void runBulk("approve")}
            disabled={selectionCount === 0 || bulkApproving || bulkRejecting}
          >
            <Check className="h-3.5 w-3.5" />
            {bulkApproving ? "Approving…" : "Approve"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void runBulk("reject")}
            disabled={selectionCount === 0 || bulkApproving || bulkRejecting}
          >
            <X className="h-3.5 w-3.5" />
            {bulkRejecting ? "Rejecting…" : "Reject"}
          </Button>
        </div>
      </div>

      {bulkProgress && (
        <div className="border-b border-border/70 bg-muted/30 px-6 py-3">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {bulkProgress.action === "approve"
                ? "Bulk approving leads"
                : "Bulk rejecting leads"}
            </span>
            <span className="tabular-nums">
              {bulkProgressPct}% · {bulkProgress.done} / {bulkProgress.total}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{
                width: `${bulkProgressPct}%`,
                background:
                  "linear-gradient(90deg, var(--brand-green), var(--brand-marigold))",
              }}
            />
          </div>
        </div>
      )}

      {bulkMessage && (
        <div className="border-b border-border/70 bg-muted/40 px-6 py-2 text-xs text-muted-foreground">
          {bulkMessage}
        </div>
      )}

      <div className="relative overflow-x-auto">
        {isProcessing && <div className="ai-scan-beam" aria-hidden />}
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
                  disabled={isProcessing}
                />
              </TableHead>
              <TableHead className="w-16">Preview</TableHead>
              <TableHead className={LEAD_COLUMN_HEAD.displayName}>
                Display Name
              </TableHead>
              <TableHead className={LEAD_COLUMN_HEAD.firstName}>
                First Name
              </TableHead>
              <TableHead className={LEAD_COLUMN_HEAD.lastName}>
                Last Name
              </TableHead>
              <TableHead className={LEAD_COLUMN_HEAD.title}>Position</TableHead>
              <TableHead className={LEAD_COLUMN_HEAD.company}>Company</TableHead>
              <TableHead className={LEAD_COLUMN_HEAD.email}>Email</TableHead>
              <TableHead className={LEAD_COLUMN_HEAD.phone}>
                Office Tel
              </TableHead>
              <TableHead className={LEAD_COLUMN_HEAD.mobile}>Mobile</TableHead>
              <TableHead className={LEAD_COLUMN_HEAD.website}>Website</TableHead>
              <TableHead className={LEAD_COLUMN_HEAD.address}>Address</TableHead>
              <TableHead className={LEAD_COLUMN_HEAD.city}>City</TableHead>
              <TableHead className={LEAD_COLUMN_HEAD.zipCode}>Zip</TableHead>
              <TableHead className={LEAD_COLUMN_HEAD.country}>Country</TableHead>
              <TableHead className={LEAD_COLUMN_HEAD.annualRevenue}>
                Annual Revenue
              </TableHead>
              <TableHead className={LEAD_COLUMN_HEAD.employeeHeadcount}>
                Headcount
              </TableHead>
              <TableHead className={LEAD_COLUMN_HEAD.gicsSector}>
                Sector
              </TableHead>
              <TableHead className={LEAD_COLUMN_HEAD.gicsIndustryGroup}>
                Industry Group
              </TableHead>
              <TableHead className={LEAD_COLUMN_HEAD.gicsIndustry}>
                Industry
              </TableHead>
              <TableHead className={LEAD_COLUMN_HEAD.gicsSubIndustry}>
                Sub-Industry
              </TableHead>
              <TableHead className={LEAD_COLUMN_HEAD.gicsSubIndustryDescription}>
                Sub-Industry Description
              </TableHead>
              <TableHead className={LEAD_COLUMN_HEAD.confidence}>
                Confidence
              </TableHead>
              <TableHead className={LEAD_COLUMN_HEAD.status}>Status</TableHead>
              <TableHead className="w-[88px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedLeads.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={25}
                  className="px-6 py-12 text-center text-sm text-muted-foreground"
                >
                  {rejectedOnly
                    ? "No rejected leads right now."
                    : lowConfidenceOnly
                      ? "No low-confidence leads need review right now."
                      : "No extracted leads to show right now."}
                </TableCell>
              </TableRow>
            )}
            {pagedLeads.map((lead) => {
              const isSelected = selectedIds.has(lead.id);
              return (
                <TableRow
                  key={lead.id}
                  data-state={isSelected ? "selected" : undefined}
                  onClick={
                    isProcessing ? undefined : () => openLead(lead)
                  }
                  aria-busy={isProcessing || undefined}
                  className={cn(
                    isProcessing ? "cursor-wait" : "cursor-pointer",
                    isProcessing && "ai-row",
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
                      disabled={isProcessing}
                    />
                  </TableCell>
                  <TableCell>
                    {lead.cardImageUrl ? (
                      <Image
                        src={lead.cardImageUrl}
                        alt="Card"
                        width={48}
                        height={32}
                        className="h-8 w-12 rounded object-cover"
                        unoptimized
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TruncCell
                    value={lead.displayName ?? lead.name}
                    className={cn(
                      LEAD_COLUMN_CELL.displayName,
                      "font-medium text-foreground"
                    )}
                    emphasize
                  />
                  <TruncCell
                    value={lead.firstName}
                    className={LEAD_COLUMN_CELL.firstName}
                  />
                  <TruncCell
                    value={lead.lastName}
                    className={LEAD_COLUMN_CELL.lastName}
                  />
                  <TruncCell
                    value={lead.title}
                    className={LEAD_COLUMN_CELL.title}
                  />
                  <TruncCell
                    value={lead.company}
                    className={LEAD_COLUMN_CELL.company}
                    emphasize
                  />
                  <TruncCell
                    value={lead.email}
                    className={LEAD_COLUMN_CELL.email}
                  />
                  <TruncCell
                    value={lead.phone}
                    className={LEAD_COLUMN_CELL.phone}
                  />
                  <TruncCell
                    value={lead.mobile}
                    className={LEAD_COLUMN_CELL.mobile}
                  />
                  <TruncCell
                    value={lead.website}
                    className={LEAD_COLUMN_CELL.website}
                  />
                  <TruncCell
                    value={lead.address}
                    className={LEAD_COLUMN_CELL.address}
                  />
                  <TruncCell
                    value={lead.city}
                    className={LEAD_COLUMN_CELL.city}
                  />
                  <TruncCell
                    value={lead.zipCode}
                    className={LEAD_COLUMN_CELL.zipCode}
                  />
                  <TruncCell
                    value={lead.country}
                    className={LEAD_COLUMN_CELL.country}
                  />
                  <TruncCell
                    value={lead.annualRevenue}
                    className={LEAD_COLUMN_CELL.annualRevenue}
                  />
                  <TruncCell
                    value={lead.employeeHeadcount}
                    className={LEAD_COLUMN_CELL.employeeHeadcount}
                  />
                  <TruncCell
                    value={lead.gicsSector}
                    className={LEAD_COLUMN_CELL.gicsSector}
                    emphasize
                  />
                  <TruncCell
                    value={lead.gicsIndustryGroup}
                    className={LEAD_COLUMN_CELL.gicsIndustryGroup}
                    emphasize
                  />
                  <TruncCell
                    value={lead.gicsIndustry}
                    className={LEAD_COLUMN_CELL.gicsIndustry}
                    emphasize
                  />
                  <TruncCell
                    value={lead.gicsSubIndustry}
                    className={LEAD_COLUMN_CELL.gicsSubIndustry}
                    emphasize
                  />
                  <TruncCell
                    value={lead.gicsSubIndustryDescription}
                    className={LEAD_COLUMN_CELL.gicsSubIndustryDescription}
                  />
                  <TableCell>
                    <ConfidenceBadge confidence={lead.confidence} />
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        lead.reviewStatus === "approved"
                          ? "default"
                          : lead.reviewStatus === "rejected"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {lead.reviewStatus}
                    </Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {isProcessing ? (
                      <span
                        className={cn(
                          buttonVariants({ variant: "ghost", size: "sm" }),
                          "pointer-events-none opacity-50"
                        )}
                        aria-disabled="true"
                      >
                        Review
                      </span>
                    ) : (
                      <Link
                        href={`/imports/${importId}/review/${lead.id}`}
                        className={cn(
                          buttonVariants({ variant: "ghost", size: "sm" })
                        )}
                      >
                        Review
                      </Link>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {totalLeads > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 px-6 py-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="text-xs uppercase tracking-[0.14em]">
              Rows per page
            </span>
            <Select
              value={String(activePageSize)}
              onValueChange={(v) => v && setPageSizeSafe(Number(v))}
            >
              <SelectTrigger className="h-8 w-[84px]">
                <SelectValue>{(v) => v ?? String(activePageSize)}</SelectValue>
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
                onClick={() => setPageSafe(1)}
                disabled={!canPrev}
                aria-label="First page"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPageSafe(Math.max(1, safePage - 1))}
                disabled={!canPrev}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPageSafe(Math.min(totalPages, safePage + 1))}
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
                onClick={() => setPageSafe(totalPages)}
                disabled={!canNext}
                aria-label="Last page"
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <ExtractedLeadDetailDrawer
        lead={activeLead}
        importId={importId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onUpdate={handleLeadUpdated}
        onStatusChange={() => onLeadsChanged?.()}
      />
    </>
  );
}
