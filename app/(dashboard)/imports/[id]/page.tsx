"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Clock,
  Database,
  RefreshCw,
  RotateCw,
  Sparkles,
  XOctagon,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ExtractedLeadTable } from "@/components/extracted-lead-table";
import type { PageInfo } from "@/lib/api/pagination";
import type { ExtractedLead, Import, ImportBulkJob } from "@/lib/db/schema";

type ImportStats = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  classified: number;
  enrichmentTotal: number;
  enrichmentPending: number;
  enrichmentDone: number;
  lowConfidence: number;
};

const DEFAULT_LEADS_PAGE_SIZE = 10;
const LARGE_PRERENDER_BATCH_SIZE = 50;

async function readJsonResponse(res: Response) {
  const text = await res.text();
  if (!text.trim()) return null;
  return JSON.parse(text);
}

export default function ImportDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [imp, setImp] = useState<Import | null>(null);
  const [leads, setLeads] = useState<ExtractedLead[]>([]);
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [statsUpdatedAt, setStatsUpdatedAt] = useState(0);
  const [enrichmentRunTotal, setEnrichmentRunTotal] = useState(0);
  const [leadsPageInfo, setLeadsPageInfo] = useState<PageInfo | null>(null);
  const [leadsPage, setLeadsPage] = useState(1);
  const [leadsPageSize, setLeadsPageSize] = useState(DEFAULT_LEADS_PAGE_SIZE);
  const [lowConfidenceOnly, setLowConfidenceOnly] = useState(false);
  const [rejectedOnly, setRejectedOnly] = useState(false);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [reclassifying, setReclassifying] = useState(false);
  const [reclassifyMessage, setReclassifyMessage] = useState<string | null>(
    null
  );
  const [reEnriching, setReEnriching] = useState(false);
  const [reEnrichMessage, setReEnrichMessage] = useState<string | null>(null);
  const [retryingPages, setRetryingPages] = useState(false);
  const [retryPagesMessage, setRetryPagesMessage] = useState<string | null>(
    null
  );
  const [terminating, setTerminating] = useState(false);
  const [terminateMessage, setTerminateMessage] = useState<string | null>(null);
  const [approvingAll, setApprovingAll] = useState(false);
  const [approveAllMessage, setApproveAllMessage] = useState<string | null>(
    null
  );
  const [bulkJobs, setBulkJobs] = useState<ImportBulkJob[]>([]);
  const fetchImport = useCallback(async () => {
    try {
      const res = await fetch(`/api/imports/${id}`);
      const data = await readJsonResponse(res);
      if (res.ok && data && typeof data === "object" && "import" in data) {
        setImp(data.import as Import);
      }
    } catch {
      // Polling should not crash the page if a dev response is interrupted.
    }
  }, [id]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/imports/${id}/stats`);
      const data = await readJsonResponse(res);
      if (res.ok && data && typeof data === "object" && "stats" in data) {
        setStats(data.stats as ImportStats);
        setStatsUpdatedAt(Date.now());
      }
    } catch {
      // Keep showing the last known stats until the next successful poll.
    }
  }, [id]);

  const fetchLeads = useCallback(async () => {
    const offset = (leadsPage - 1) * leadsPageSize;
    const params = new URLSearchParams({
      limit: String(leadsPageSize),
      offset: String(offset),
    });
    if (rejectedOnly) {
      params.set("reviewStatus", "rejected");
    } else {
      params.set("excludeRejected", "true");
      if (lowConfidenceOnly) params.set("lowConfidenceOnly", "true");
    }
    try {
      const res = await fetch(`/api/imports/${id}/leads?${params}`);
      const data = await readJsonResponse(res);
      if (res.ok && data && typeof data === "object") {
        setLeads("leads" in data ? ((data.leads as ExtractedLead[]) ?? []) : []);
        setLeadsPageInfo(
          "pageInfo" in data ? ((data.pageInfo as PageInfo | null) ?? null) : null
        );
      }
    } catch {
      // Keep the current page visible if a poll returns an empty response.
    } finally {
      setLeadsLoading(false);
    }
  }, [id, leadsPage, leadsPageSize, lowConfidenceOnly, rejectedOnly]);

  const fetchBulkJobs = useCallback(async () => {
    try {
      const res = await fetch(`/api/imports/${id}/bulk-jobs`);
      const data = await readJsonResponse(res);
      if (res.ok && data && typeof data === "object" && "jobs" in data) {
        setBulkJobs((data.jobs as ImportBulkJob[]) ?? []);
      }
    } catch {
      // Keep the last known bulk progress until the next successful poll.
    }
  }, [id]);

  const fetchData = useCallback(async () => {
    await Promise.allSettled([
      fetchImport(),
      fetchStats(),
      fetchLeads(),
      fetchBulkJobs(),
    ]);
  }, [fetchImport, fetchStats, fetchLeads, fetchBulkJobs]);

  useEffect(() => {
    setLeadsLoading(true);
    void fetchLeads();
  }, [fetchLeads]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void fetchData();
    }, 0);
    const interval = setInterval(fetchData, 3000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [fetchData]);

  const reEnrichImport = useCallback(async () => {
    setReEnriching(true);
    setReEnrichMessage(null);
    try {
      const res = await fetch(`/api/imports/${id}/re-enrich`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setReEnrichMessage(data.error ?? "Failed to queue AI enrichment");
        return;
      }
      if (data.queued > 0) {
        setEnrichmentRunTotal(data.queued);
      }
      setReEnrichMessage(
        data.queued > 0
          ? `Queued ${data.queued} lead(s) for AI enrichment`
          : data.message ?? "All leads already enriched"
      );
      await fetchData();
    } finally {
      setReEnriching(false);
    }
  }, [fetchData, id]);

  const retryMissingPages = useCallback(async () => {
    setRetryingPages(true);
    setRetryPagesMessage(null);
    try {
      const res = await fetch(`/api/imports/${id}/retry-pages`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRetryPagesMessage(data.error ?? "Failed to retry missing pages");
        return;
      }
      setRetryPagesMessage(
        data.queued > 0
          ? `Re-queued ${data.queued} page(s)`
          : data.message ?? "No missing pages"
      );
      await fetchData();
    } finally {
      setRetryingPages(false);
    }
  }, [fetchData, id]);

  const reclassifyImport = useCallback(async () => {
    setReclassifying(true);
    setReclassifyMessage(null);
    try {
      const res = await fetch(`/api/imports/${id}/reclassify`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setReclassifyMessage(data.error ?? "Failed to queue reclassification");
        return;
      }
      setReclassifyMessage(
        data.queued > 0
          ? `Queued ${data.queued} lead(s) for reclassification`
          : data.message ?? "No leads require reclassification"
      );
      await fetchData();
    } finally {
      setReclassifying(false);
    }
  }, [fetchData, id]);

  const terminateImport = useCallback(async () => {
    setTerminating(true);
    setTerminateMessage(null);
    try {
      const res = await fetch(`/api/imports/${id}/terminate`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTerminateMessage(data.error ?? "Failed to terminate import");
        return;
      }
      setTerminateMessage("Import termination requested");
      await fetchData();
    } finally {
      setTerminating(false);
    }
  }, [fetchData, id]);

  const approveAllPending = useCallback(async () => {
    if ((stats?.pending ?? 0) === 0) {
      setApproveAllMessage("No pending leads to approve");
      return;
    }

    setApprovingAll(true);
    setApproveAllMessage(null);
    try {
      const res = await fetch(`/api/imports/${id}/bulk/approve`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setApproveAllMessage(data.error ?? "Failed to start bulk approve");
        return;
      }
      setApproveAllMessage(
        data.message ??
          `Bulk approve started for ${data.totalCount ?? stats?.pending} lead(s)`
      );
      if (data.job) {
        setBulkJobs((current) => [data.job as ImportBulkJob, ...current]);
      }
      await fetchData();
    } finally {
      setApprovingAll(false);
    }
  }, [fetchData, id, stats?.pending]);

  const leadStats = stats ?? {
    pending: 0,
    approved: 0,
    rejected: 0,
    classified: 0,
    enrichmentTotal: 0,
    enrichmentPending: 0,
    enrichmentDone: 0,
    lowConfidence: 0,
    total: 0,
  };

  useEffect(() => {
    if (!imp) {
      setEnrichmentRunTotal(0);
      return;
    }

    const stopped = imp.status === "failed" || imp.status === "terminated";
    const completed =
      imp.status === "ready_for_review" || imp.status === "completed";
    const total = imp.totalItems ?? 0;
    const prepared = imp.pagesPrepared ?? 0;
    const extracted = imp.processedItems ?? 0;
    const prerenderComplete = total > 0 && prepared >= total;
    const processing =
      !stopped &&
      !completed &&
      imp.status !== "extracting" &&
      !prerenderComplete &&
      extracted === 0;
    const saving =
      !stopped &&
      !completed &&
      !processing &&
      (imp.status === "extracting" ||
        (total > 0 && extracted < total) ||
        (extracted > 0 && imp.status === "processing"));
    const active =
      !stopped &&
      imp.status === "enriching" &&
      !processing &&
      !saving &&
      leadStats.enrichmentTotal > 0 &&
      leadStats.enrichmentPending > 0;

    if (active) {
      setEnrichmentRunTotal((current) =>
        current <= 0 || current < leadStats.enrichmentPending
          ? leadStats.enrichmentPending
          : current
      );
      return;
    }

    if (stopped || leadStats.enrichmentPending === 0) {
      setEnrichmentRunTotal(0);
    }
  }, [
    imp,
    leadStats.enrichmentPending,
    leadStats.enrichmentTotal,
  ]);

  if (!imp) {
    return <p className="text-muted-foreground">Loading import…</p>;
  }

  const filePct =
    imp.totalItems > 0
      ? Math.min(100, Math.round((imp.processedItems / imp.totalItems) * 100))
      : 0;

  const importStopped =
    imp.status === "failed" || imp.status === "terminated";
  const isCompletedStatus =
    imp.status === "ready_for_review" || imp.status === "completed";
  const totalPages = imp.totalItems ?? 0;
  const preparedPages = imp.pagesPrepared ?? 0;
  const extractedPages = imp.processedItems ?? 0;
  const prerenderDone = totalPages > 0 && preparedPages >= totalPages;

  const isProcessing =
    !importStopped &&
    !isCompletedStatus &&
    imp.status !== "extracting" &&
    !prerenderDone &&
    extractedPages === 0;

  const isSaving =
    !importStopped &&
    !isCompletedStatus &&
    !isProcessing &&
    (imp.status === "extracting" ||
      (totalPages > 0 && extractedPages < totalPages) ||
      (extractedPages > 0 && imp.status === "processing"));

  const processingComplete = !isProcessing;
  const savingComplete = !isProcessing && !isSaving;
  const enrichmentActive =
    imp.status === "enriching" &&
    savingComplete &&
    leadStats.enrichmentTotal > 0 &&
    leadStats.enrichmentPending > 0;
  const enrichmentComplete =
    savingComplete &&
    leadStats.enrichmentTotal > 0 &&
    leadStats.enrichmentPending === 0;
  const enrichmentProgressTotal = enrichmentActive
    ? Math.max(enrichmentRunTotal, leadStats.enrichmentPending)
    : leadStats.enrichmentTotal;
  const enrichmentProgressDone = enrichmentActive
    ? Math.max(0, enrichmentProgressTotal - leadStats.enrichmentPending)
    : leadStats.enrichmentDone;
  const enrichmentPct =
    enrichmentProgressTotal > 0
      ? Math.min(
          100,
          Math.round((enrichmentProgressDone / enrichmentProgressTotal) * 100)
        )
      : 0;

  type Phase = "processing" | "saving" | "enrichment" | "complete";
  const phase: Phase = isProcessing
    ? "processing"
    : isSaving
      ? "saving"
      : enrichmentActive
        ? "enrichment"
        : "complete";

  const showPhasePanel =
    isProcessing ||
    isSaving ||
    enrichmentActive ||
    (enrichmentComplete && phase === "complete");
  const canTerminate =
    imp.status === "uploaded" ||
    imp.status === "uploading" ||
    imp.status === "processing" ||
    imp.status === "counting_pages" ||
    imp.status === "preparing_pages" ||
    imp.status === "extracting" ||
    enrichmentActive;

  const hasDetectedItems = imp.totalItems > 0;
  const hasSavedRows = imp.processedItems > 0 || leadStats.total > 0;
  const largePdfMessage = getLargePdfActivityMessage(imp);
  const estimatedCompletionSeconds = estimateLargePdfSeconds(
    imp,
    enrichmentActive ? leadStats.enrichmentPending : 0
  );
  const activityMessages = isProcessing
    ? buildProcessingActivityMessages({
        imp,
        hasDetectedItems,
        largePdfMessage,
      })
    : isSaving
      ? buildSavingActivityMessages({
          imp,
          hasDetectedItems,
          hasSavedRows,
          largePdfMessage,
        })
      : enrichmentActive
        ? [
            largePdfMessage,
            "AILA is enriching lead details…",
            "Classifying leads with GICS…",
            "Checking missing company and contact data…",
          ].filter((message): message is string => Boolean(message))
        : [];

  const prerenderPct =
    totalPages > 0
      ? Math.min(100, Math.round((preparedPages / totalPages) * 100))
      : 0;

  const enrichmentSecondsRemaining = enrichmentActive
    ? Math.max(1, Math.ceil((leadStats.enrichmentPending * 6) / 8))
    : 0;

  const latestApproveJob = bulkJobs.find(
    (job) => job.jobType === "approve_pending"
  );
  const activeApproveJob =
    latestApproveJob &&
    (latestApproveJob.status === "pending" ||
      latestApproveJob.status === "running")
      ? latestApproveJob
      : null;
  const approveProgressTotal =
    activeApproveJob?.totalCount && activeApproveJob.totalCount > 0
      ? activeApproveJob.totalCount
      : Math.max(leadStats.pending, activeApproveJob?.processedCount ?? 0);
  const approveProgressDone = activeApproveJob?.processedCount ?? 0;
  const approveProgressPct =
    approveProgressTotal > 0
      ? Math.min(
          100,
          Math.round((approveProgressDone / approveProgressTotal) * 100)
        )
      : 0;

  return (
    <div className="space-y-6">
      <Link
        href="/imports"
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "-ml-2"
        )}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All imports
      </Link>

      <section className="app-panel">
        <div className="app-panel-body space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Import
              </p>
              <h2 className="text-2xl font-semibold tracking-tight">
                {imp.fileName}
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="uppercase tracking-wide">
                  {imp.sourceType}
                </Badge>
                <Badge>{imp.status.replace(/_/g, " ")}</Badge>
                {imp.processingMode === "large" && (
                  <Badge variant="outline">Large import</Badge>
                )}
                <span className="text-sm text-muted-foreground">
                  {imp.processedItems} / {imp.totalItems} processed
                </span>
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="flex flex-wrap items-center justify-end gap-2">
              {leadStats.pending > 0 && (
                <Link
                  href={`/imports/${id}/review/${
                    leads.find((l) => l.reviewStatus === "pending")?.id ?? ""
                  }`}
                  className={cn(buttonVariants())}
                >
                  Start review ({leadStats.pending} pending)
                </Link>
              )}
              <Button
                type="button"
                variant="secondary"
                onClick={() => void approveAllPending()}
                disabled={
                  approvingAll ||
                  Boolean(activeApproveJob) ||
                  leadStats.pending === 0
                }
                className="border-transparent text-[color:color-mix(in_oklab,var(--brand-green)_70%,black)] shadow-[0_1px_2px_rgba(15,40,30,0.08)] hover:brightness-105 disabled:opacity-60"
                style={{
                  background:
                    "linear-gradient(135deg, color-mix(in oklab, var(--brand-marigold) 95%, white) 0%, color-mix(in oklab, var(--brand-marigold) 80%, var(--brand-green) 20%) 100%)",
                }}
              >
                <CheckCheck className="h-4 w-4" />
                {approvingAll || activeApproveJob
                  ? "Approving…"
                  : `Approve all (${leadStats.pending})`}
              </Button>
              <Button
                type="button"
                variant="default"
                onClick={() => void reEnrichImport()}
                disabled={reEnriching}
                className="border-transparent text-[color:var(--brand-marigold)] shadow-[0_1px_2px_rgba(15,40,30,0.18)] hover:brightness-110 disabled:opacity-60"
                style={{
                  background:
                    "linear-gradient(135deg, oklch(0.38 0.085 162) 0%, oklch(0.24 0.06 161) 100%)",
                }}
              >
                <Sparkles
                  className={cn("h-4 w-4", reEnriching && "animate-pulse")}
                  style={{ color: "var(--brand-marigold)" }}
                />
                {reEnriching ? "Queueing…" : "AI Enrich"}
              </Button>
              {imp.sourceType === "pdf" &&
                imp.totalItems > 0 &&
                imp.processedItems < imp.totalItems && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void retryMissingPages()}
                    disabled={retryingPages}
                    title={`${
                      imp.totalItems - imp.processedItems
                    } page(s) missing`}
                  >
                    <RotateCw
                      className={cn(
                        "h-4 w-4",
                        retryingPages && "animate-spin"
                      )}
                    />
                    {retryingPages
                      ? "Queueing…"
                      : `Retry failed pages (${
                          imp.totalItems - imp.processedItems
                        })`}
                  </Button>
                )}
              <Button
                type="button"
                variant="outline"
                onClick={() => void reclassifyImport()}
                disabled={reclassifying}
              >
                <RefreshCw
                  className={cn(
                    "h-4 w-4",
                    reclassifying && "animate-spin"
                  )}
                />
                {reclassifying ? "Queueing…" : "Reclassify missing"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void terminateImport()}
                disabled={terminating || !canTerminate}
                className="border-destructive/30 text-destructive hover:bg-destructive/10"
              >
                <XOctagon
                  className={cn("h-4 w-4", terminating && "animate-pulse")}
                />
                {terminating ? "Terminating…" : "Terminate import"}
              </Button>
              </div>
            </div>
          </div>

          {showPhasePanel && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                <PhaseStep
                  label="Processing"
                  state={
                    phase === "processing"
                      ? "active"
                      : processingComplete
                        ? "done"
                        : "pending"
                  }
                />
                <span className="h-px flex-1 bg-border/70" />
                <PhaseStep
                  label="Save"
                  state={
                    phase === "saving"
                      ? "active"
                      : savingComplete
                        ? "done"
                        : "pending"
                  }
                />
                <span className="h-px flex-1 bg-border/70" />
                <PhaseStep
                  label="AI Enrich"
                  state={
                    phase === "enrichment"
                      ? "active"
                      : enrichmentComplete
                        ? "done"
                        : "pending"
                  }
                />
              </div>

              {phase === "processing" && (
                <div>
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-[var(--brand-green)]" />
                      Pre-rendering pages
                    </span>
                    <span className="inline-flex items-center gap-2 tabular-nums">
                      <span>
                        {totalPages > 0
                          ? `${prerenderPct}% · ${preparedPages} / ${totalPages}`
                          : "Counting pages…"}
                      </span>
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]"
                        style={{
                          background:
                            "color-mix(in oklab, var(--brand-green) 12%, transparent)",
                          color:
                            "color-mix(in oklab, var(--brand-green) 80%, black)",
                        }}
                        title="Estimated time remaining"
                      >
                        <Clock className="h-3 w-3" />
                        <CountdownClock
                          targetSeconds={estimatedCompletionSeconds}
                          resyncKey={statsUpdatedAt}
                        />
                      </span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    {totalPages > 0 ? (
                      <div
                        className="h-full rounded-full transition-[width] duration-500"
                        style={{
                          width: `${prerenderPct}%`,
                          background:
                            "linear-gradient(90deg, var(--brand-green), var(--brand-marigold))",
                        }}
                      />
                    ) : (
                      <div
                        className="h-full w-1/3 animate-pulse rounded-full"
                        style={{
                          background:
                            "linear-gradient(90deg, var(--brand-green), var(--brand-marigold))",
                        }}
                      />
                    )}
                  </div>
                </div>
              )}

              {phase === "saving" && (
                <div>
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Database className="h-3.5 w-3.5 text-[var(--brand-green)]" />
                      Saving to database
                    </span>
                    <span className="inline-flex items-center gap-2 tabular-nums">
                      <span>
                        {filePct}% · {imp.processedItems} / {imp.totalItems}
                      </span>
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]"
                        style={{
                          background:
                            "color-mix(in oklab, var(--brand-green) 12%, transparent)",
                          color:
                            "color-mix(in oklab, var(--brand-green) 80%, black)",
                        }}
                        title="Estimated time remaining"
                      >
                        <Clock className="h-3 w-3" />
                        <CountdownClock
                          targetSeconds={estimatedCompletionSeconds}
                          resyncKey={statsUpdatedAt}
                        />
                      </span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{
                        width: `${filePct}%`,
                        background:
                          "linear-gradient(90deg, var(--brand-green), var(--brand-marigold))",
                      }}
                    />
                  </div>
                </div>
              )}

              {phase === "enrichment" && (
                <div>
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-[var(--brand-marigold)]" />
                      AI Enrichment in progress
                    </span>
                    <span className="inline-flex items-center gap-2 tabular-nums">
                      <span>
                        {enrichmentPct}% · {enrichmentProgressDone} /{" "}
                        {enrichmentProgressTotal}
                      </span>
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]"
                        style={{
                          background:
                            "color-mix(in oklab, var(--brand-marigold) 18%, transparent)",
                          color:
                            "color-mix(in oklab, var(--brand-green) 80%, black)",
                        }}
                        title="Estimated time remaining for AI enrichment"
                      >
                        <Clock className="h-3 w-3" />
                        <CountdownClock
                          targetSeconds={enrichmentSecondsRemaining}
                          resyncKey={statsUpdatedAt}
                        />
                      </span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full animate-pulse rounded-full transition-[width] duration-500"
                      style={{
                        width: `${enrichmentPct}%`,
                        background:
                          "linear-gradient(90deg, var(--brand-marigold), var(--brand-green))",
                      }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    AILA is enriching your leads with AI — up to 8 in parallel.
                  </p>
                </div>
              )}

              {phase === "complete" && enrichmentComplete && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Check className="h-3.5 w-3.5 text-[var(--success)]" />
                  Saved and AI enriched — ready for review.
                </div>
              )}

              {activityMessages.length > 0 && (
                <ImportActivityText messages={activityMessages} />
              )}
            </div>
          )}

          {activeApproveJob && (
            <div className="rounded-xl border border-border/70 bg-muted/25 p-3">
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCheck className="h-3.5 w-3.5 text-[var(--brand-green)]" />
                  Bulk approving leads
                </span>
                <span className="tabular-nums">
                  {approveProgressTotal > 0
                    ? `${approveProgressPct}% · ${approveProgressDone} / ${approveProgressTotal}`
                    : "Preparing…"}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-500",
                    approveProgressTotal === 0 && "w-1/3 animate-pulse"
                  )}
                  style={{
                    width:
                      approveProgressTotal > 0
                        ? `${approveProgressPct}%`
                        : undefined,
                    background:
                      "linear-gradient(90deg, var(--brand-green), var(--brand-marigold))",
                  }}
                />
              </div>
            </div>
          )}

          {(approveAllMessage ||
            reclassifyMessage ||
            reEnrichMessage ||
            retryPagesMessage ||
            terminateMessage) && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {approveAllMessage && (
                <span className="brand-pill">
                  <CheckCheck className="h-3 w-3" />
                  {approveAllMessage}
                </span>
              )}
              {retryPagesMessage && (
                <span className="brand-pill">
                  <RotateCw className="h-3 w-3" />
                  {retryPagesMessage}
                </span>
              )}
              {reEnrichMessage && (
                <span className="brand-pill">
                  <Sparkles className="h-3 w-3" />
                  {reEnrichMessage}
                </span>
              )}
              {reclassifyMessage && (
                <span className="brand-pill">
                  <RefreshCw className="h-3 w-3" />
                  {reclassifyMessage}
                </span>
              )}
              {terminateMessage && (
                <span className="brand-pill">
                  <XOctagon className="h-3 w-3" />
                  {terminateMessage}
                </span>
              )}
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat label="Pending" value={leadStats.pending} tone="muted" />
        <MiniStat label="Approved" value={leadStats.approved} tone="success" />
        <MiniStat label="Rejected" value={leadStats.rejected} tone="danger" />
        <MiniStat label="Classified" value={leadStats.classified} tone="brand" />
      </div>

      <section className="app-panel">
        <div className="app-panel-header">
          <h3 className="text-base font-semibold">Extracted leads</h3>
          <p className="text-xs text-muted-foreground">
            Review and approve. Approved leads dedupe into your Leads workspace.
          </p>
        </div>
        <div className="app-panel-body p-0">
          <ExtractedLeadTable
            leads={leads}
            importId={id}
            isProcessing={isSaving || enrichmentActive}
            onLeadsChanged={() => void fetchData()}
            serverPagination={{
              totalCount: leadsPageInfo?.totalCount ?? 0,
              offset: leadsPageInfo?.offset ?? 0,
              limit: leadsPageInfo?.limit ?? leadsPageSize,
              loading: leadsLoading,
              lowConfidenceCount: leadStats.lowConfidence,
              rejectedCount: leadStats.rejected,
              onPageChange: setLeadsPage,
              onPageSizeChange: (size) => {
                setLeadsPageSize(size);
                setLeadsPage(1);
              },
              onLowConfidenceOnlyChange: setLowConfidenceOnly,
              onRejectedOnlyChange: setRejectedOnly,
            }}
          />
        </div>
      </section>
    </div>
  );
}

function ImportActivityText({ messages }: { messages: string[] }) {
  const [index, setIndex] = useState(0);
  const safeIndex = messages.length > 0 ? index % messages.length : 0;

  useEffect(() => {
    if (messages.length <= 1) return;

    const interval = setInterval(() => {
      setIndex((current) => (current + 1) % messages.length);
    }, 2200);

    return () => clearInterval(interval);
  }, [messages]);

  return (
    <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
      <Sparkles className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
      <span key={messages[safeIndex]} className="animate-pulse">
        {messages[safeIndex]}
      </span>
    </p>
  );
}

function buildProcessingActivityMessages({
  imp,
  hasDetectedItems,
  largePdfMessage,
}: {
  imp: Import;
  hasDetectedItems: boolean;
  largePdfMessage: string | null;
}): string[] {
  if (imp.status === "counting_pages" || !hasDetectedItems) {
    if (imp.sourceType === "pdf") {
      return [
        largePdfMessage,
        "Reading the PDF and counting pages…",
        "Preparing the extraction plan…",
      ].filter((message): message is string => Boolean(message));
    }
    return [
      "Reading workbook sheets…",
      "Detecting rows and columns…",
      "Preparing spreadsheet data for import…",
    ];
  }

  if (imp.sourceType === "pdf") {
    return [
      largePdfMessage,
      getLargePdfBatchMessage(imp),
      "Pre-rendering PDF pages…",
      "Generating optimized card previews…",
      "Preparing page data before extraction…",
    ].filter((message): message is string => Boolean(message));
  }

  return [
    "Normalizing spreadsheet rows…",
    "Cleaning contact fields…",
    "Preparing lead records for import…",
  ];
}

function buildSavingActivityMessages({
  imp,
  hasDetectedItems,
  hasSavedRows,
  largePdfMessage,
}: {
  imp: Import;
  hasDetectedItems: boolean;
  hasSavedRows: boolean;
  largePdfMessage: string | null;
}): string[] {
  if (imp.status === "extracting") {
    return [
      largePdfMessage,
      "Extracting leads in batches…",
      "Saving extracted lead records…",
      "Classifying leads…",
      "Preparing leads for review…",
    ].filter((message): message is string => Boolean(message));
  }

  if (!hasDetectedItems || !hasSavedRows) {
    return imp.sourceType === "pdf"
      ? [
          largePdfMessage,
          "Extracting text from PDF pages…",
          "Saving extracted leads to the database…",
          "Classifying leads…",
          "Preparing leads for review…",
        ].filter((message): message is string => Boolean(message))
      : [
          "Saving lead records to the database…",
          "Classifying leads…",
          "Preparing leads for review…",
          "Finalizing extracted records…",
        ];
  }

  return [
    largePdfMessage,
    "Saving extracted leads to the database…",
    "Classifying leads…",
    "Preparing leads for review…",
    "Finalizing extracted records…",
  ].filter((message): message is string => Boolean(message));
}

function getLargePdfActivityMessage(imp: Import): string | null {
  if (imp.sourceType !== "pdf" || imp.processingMode !== "large") return null;
  if (
    imp.status !== "processing" &&
    imp.status !== "counting_pages" &&
    imp.status !== "preparing_pages" &&
    imp.status !== "extracting" &&
    imp.status !== "enriching"
  ) {
    return null;
  }

  return "Processing large PDF…";
}

function getLargePdfBatchMessage(imp: Import): string | null {
  if (
    imp.sourceType !== "pdf" ||
    imp.processingMode !== "large" ||
    imp.status !== "preparing_pages" ||
    imp.totalItems <= 0
  ) {
    return null;
  }

  const totalBatches = Math.max(
    1,
    Math.ceil(imp.totalItems / LARGE_PRERENDER_BATCH_SIZE)
  );
  const completedBatches = Math.min(
    totalBatches,
    Math.floor((imp.pagesPrepared ?? 0) / LARGE_PRERENDER_BATCH_SIZE)
  );
  const runningBatch =
    completedBatches < totalBatches ? completedBatches + 1 : totalBatches;

  if (completedBatches >= totalBatches) {
    return `Pre-render batches complete: ${completedBatches}/${totalBatches}.`;
  }

  return `Pre-render batches: ${completedBatches}/${totalBatches} complete, batch ${runningBatch} running.`;
}

function estimateLargePdfSeconds(
  imp: Import,
  enrichmentRemaining: number = 0
): number {
  const totalPages = Math.max(0, imp.totalItems ?? 0);
  if (totalPages === 0 && enrichmentRemaining === 0) return 60;

  const prepared = Math.min(totalPages, Math.max(0, imp.pagesPrepared ?? 0));
  const extracted = Math.min(totalPages, Math.max(0, imp.processedItems ?? 0));

  const remainingPreparation = Math.max(0, totalPages - prepared);
  const remainingExtraction = Math.max(0, totalPages - extracted);

  // Enrichment is concurrent (limit 8) so divide.
  const enrichmentSeconds = (enrichmentRemaining * 6) / 8;

  const seconds =
    imp.status === "enriching"
      ? enrichmentSeconds
      : imp.status === "preparing_pages"
        ? remainingPreparation * 1.5 + remainingExtraction * 4 + enrichmentSeconds
        : imp.status === "extracting"
          ? remainingExtraction * 4 + enrichmentSeconds
          : totalPages * 4 + enrichmentSeconds;

  return Math.max(1, Math.round(seconds));
}

function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function CountdownClock({
  targetSeconds,
  resyncKey = 0,
}: {
  targetSeconds: number;
  resyncKey?: number;
}) {
  const [remaining, setRemaining] = useState(targetSeconds);

  useEffect(() => {
    setRemaining(targetSeconds);
  }, [targetSeconds, resyncKey]);

  useEffect(() => {
    if (remaining <= 0) return;
    const interval = setInterval(() => {
      setRemaining((current) => (current > 1 ? current - 1 : 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [remaining]);

  return (
    <span className="tabular-nums">{formatCountdown(remaining)}</span>
  );
}

function PhaseStep({
  label,
  state,
}: {
  label: string;
  state: "pending" | "active" | "done";
}) {
  const dot =
    state === "done"
      ? "var(--success)"
      : state === "active"
        ? "var(--brand-marigold)"
        : "var(--muted-foreground)";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5",
        state === "active" && "text-foreground",
        state === "done" && "text-foreground/70"
      )}
    >
      <span
        className={cn(
          "inline-flex h-3.5 w-3.5 items-center justify-center rounded-full",
          state === "active" && "animate-pulse"
        )}
        style={{
          background:
            state === "done"
              ? "color-mix(in oklab, var(--success) 20%, transparent)"
              : state === "active"
                ? "color-mix(in oklab, var(--brand-marigold) 25%, transparent)"
                : "color-mix(in oklab, var(--muted-foreground) 15%, transparent)",
          color: dot,
        }}
      >
        {state === "done" ? (
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
        ) : (
          <span
            className="h-1 w-1 rounded-full"
            style={{ background: dot }}
          />
        )}
      </span>
      {label}
    </span>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "brand" | "success" | "muted" | "danger";
}) {
  const dot: Record<typeof tone, string> = {
    brand: "var(--brand-marigold)",
    success: "var(--success)",
    muted: "var(--muted-foreground)",
    danger: "var(--destructive)",
  };
  return (
    <div className="app-stat flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: dot[tone] }}
        />
        {label}
      </div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}
