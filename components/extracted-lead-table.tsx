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
import type { ExtractedLead } from "@/lib/db/schema";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200] as const;
const DEFAULT_PAGE_SIZE = 25;
const LOW_CONFIDENCE_THRESHOLD = 0.6;

type Props = {
  leads: ExtractedLead[];
  importId: string;
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

function cell(value: string | null | undefined) {
  return value?.trim() || "—";
}

function getConfidence(lead: ExtractedLead): number {
  const value = lead.confidence;
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "string" ? parseFloat(value) : value;
  return Number.isFinite(parsed) ? parsed : 0;
}

function AIWorkingPill() {
  return (
    <span className="ai-pill" aria-label="AI enrichment in progress">
      <Sparkles className="ai-pulse-icon h-3 w-3" />
      <span>
        AI Enriching<span className="ai-dots" aria-hidden />
      </span>
    </span>
  );
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
  isProcessing = false,
  onLeadsChanged,
}: Props) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [lowConfidenceOnly, setLowConfidenceOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);
  const [bulkRejecting, setBulkRejecting] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [activeLead, setActiveLead] = useState<ExtractedLead | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Snap back to page 1 when page size changes. Don't reset on `leads`
  // changes — the import detail page polls every 3s while extraction is
  // in flight and we don't want to bounce the user back.
  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  // Filter changes should feel like a fresh view, not carry hidden selections.
  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [lowConfidenceOnly]);

  // Auto-dismiss bulk-action toast.
  useEffect(() => {
    if (!bulkMessage) return;
    const t = setTimeout(() => setBulkMessage(null), 4000);
    return () => clearTimeout(t);
  }, [bulkMessage]);

  // Prune selection of IDs that have disappeared (e.g. import deleted).
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const visible = new Set(leads.map((l) => l.id));
    let changed = false;
    const next = new Set<string>();
    for (const id of selectedIds) {
      if (visible.has(id)) next.add(id);
      else changed = true;
    }
    if (changed) setSelectedIds(next);
  }, [leads, selectedIds]);

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

  const lowConfidenceLeads = useMemo(
    () =>
      leads.filter(
        (lead) => getConfidence(lead) < LOW_CONFIDENCE_THRESHOLD
      ),
    [leads]
  );
  const visibleLeads = lowConfidenceOnly ? lowConfidenceLeads : leads;
  const totalExtractedLeads = leads.length;
  const totalLeads = visibleLeads.length;
  const totalPages = Math.max(1, Math.ceil(totalLeads / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = totalLeads === 0 ? 0 : (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalLeads);
  const canPrev = safePage > 1;
  const canNext = safePage < totalPages;

  const pagedLeads = useMemo(
    () => visibleLeads.slice(startIndex, endIndex),
    [visibleLeads, startIndex, endIndex]
  );

  const enrichmentActive = leads.some(
    (lead) => lead.enrichmentStatus === "pending"
  );

  const toggleSelectOne = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

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

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(visibleLeads.map((l) => l.id)));
  }, [visibleLeads]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const allPageSelected =
    pagedLeads.length > 0 && pagedLeads.every((l) => selectedIds.has(l.id));
  const somePageSelected =
    pagedLeads.some((l) => selectedIds.has(l.id)) && !allPageSelected;
  const selectionCount = selectedIds.size;
  const allSelected = totalLeads > 0 && selectionCount === totalLeads;

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
      }
    },
    [selectedIds, onLeadsChanged]
  );

  if (totalExtractedLeads === 0) {
    return (
      <p className="px-6 py-10 text-center text-sm text-muted-foreground">
        No extracted leads yet. Processing may still be in progress.
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
              {!allSelected && totalLeads > selectionCount && (
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-xs font-medium text-foreground/80 underline-offset-2 hover:text-foreground hover:underline"
                >
                  Select all {totalLeads} extracted leads
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
            <button
              type="button"
              onClick={() => setLowConfidenceOnly((value) => !value)}
              disabled={lowConfidenceLeads.length === 0}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                lowConfidenceOnly
                  ? "border-warning/50 bg-warning/15 text-foreground"
                  : "border-border/70 bg-background text-muted-foreground hover:border-warning/50 hover:text-foreground",
                lowConfidenceLeads.length === 0 &&
                  "cursor-not-allowed opacity-50 hover:border-border/70 hover:text-muted-foreground"
              )}
              title="Show only extracted leads below 60% confidence"
            >
              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
              Needs review
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                {lowConfidenceLeads.length}
              </span>
            </button>
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

      {bulkMessage && (
        <div className="border-b border-border/70 bg-muted/40 px-6 py-2 text-xs text-muted-foreground">
          {bulkMessage}
        </div>
      )}

      <div className="relative overflow-x-auto">
        {(isProcessing || enrichmentActive) && (
          <div className="ai-scan-beam" aria-hidden />
        )}
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
              <TableHead>Display Name</TableHead>
              <TableHead>First Name</TableHead>
              <TableHead>Last Name</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Office Tel</TableHead>
              <TableHead>Mobile</TableHead>
              <TableHead>Website</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Zip</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Annual Revenue</TableHead>
              <TableHead>Headcount</TableHead>
              <TableHead>Sector</TableHead>
              <TableHead>Industry Group</TableHead>
              <TableHead>Industry</TableHead>
              <TableHead>Sub-Industry</TableHead>
              <TableHead>Sub-Industry Description</TableHead>
              <TableHead>Enrichment</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedLeads.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={26}
                  className="px-6 py-12 text-center text-sm text-muted-foreground"
                >
                  No low-confidence leads need review right now.
                </TableCell>
              </TableRow>
            )}
            {pagedLeads.map((lead) => {
              const isEnriching = lead.enrichmentStatus === "pending";
              const isSelected = selectedIds.has(lead.id);
              const rowLoading = isProcessing || isEnriching;
              return (
                <TableRow
                  key={lead.id}
                  data-state={isSelected ? "selected" : undefined}
                  onClick={
                    isProcessing ? undefined : () => openLead(lead)
                  }
                  aria-busy={rowLoading || undefined}
                  className={cn(
                    isProcessing ? "cursor-wait" : "cursor-pointer",
                    rowLoading && "ai-row",
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
                  <TableCell className="font-medium">
                    {cell(lead.displayName ?? lead.name)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {cell(lead.firstName)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {cell(lead.lastName)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {cell(lead.title)}
                  </TableCell>
                  <TableCell>{cell(lead.company)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {cell(lead.email)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {cell(lead.phone)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {cell(lead.mobile)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {cell(lead.website)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {cell(lead.address)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {cell(lead.city)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {cell(lead.zipCode)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {cell(lead.country)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {cell(lead.annualRevenue)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {cell(lead.employeeHeadcount)}
                  </TableCell>
                  <TableCell>{cell(lead.gicsSector)}</TableCell>
                  <TableCell>{cell(lead.gicsIndustryGroup)}</TableCell>
                  <TableCell>{cell(lead.gicsIndustry)}</TableCell>
                  <TableCell>{cell(lead.gicsSubIndustry)}</TableCell>
                  <TableCell
                    className="max-w-[240px] truncate text-muted-foreground"
                    title={lead.gicsSubIndustryDescription ?? undefined}
                  >
                    {cell(lead.gicsSubIndustryDescription)}
                  </TableCell>
                  <TableCell>
                    {isEnriching ? (
                      <AIWorkingPill />
                    ) : (
                      <Badge
                        variant={
                          lead.enrichmentStatus === "enriched"
                            ? "default"
                            : lead.enrichmentStatus === "failed"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {lead.enrichmentStatus === "enriched"
                          ? "AI Enriched"
                          : lead.enrichmentStatus}
                      </Badge>
                    )}
                  </TableCell>
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
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
