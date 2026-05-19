"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Database,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ExtractedLeadTable } from "@/components/extracted-lead-table";
import type { ExtractedLead, Import } from "@/lib/db/schema";

export default function ImportDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [imp, setImp] = useState<Import | null>(null);
  const [leads, setLeads] = useState<ExtractedLead[]>([]);
  const [reclassifying, setReclassifying] = useState(false);
  const [reclassifyMessage, setReclassifyMessage] = useState<string | null>(
    null
  );
  const [reEnriching, setReEnriching] = useState(false);
  const [reEnrichMessage, setReEnrichMessage] = useState<string | null>(null);
  const [approvingAll, setApprovingAll] = useState(false);
  const [approveAllMessage, setApproveAllMessage] = useState<string | null>(
    null
  );

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/imports/${id}`);
    const data = await res.json();
    if (res.ok) {
      setImp(data.import);
      setLeads(data.extractedLeads ?? []);
    }
  }, [id]);

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

  const approveAllPending = useCallback(async () => {
    const pendingIds = leads
      .filter((lead) => lead.reviewStatus === "pending")
      .map((lead) => lead.id);

    if (pendingIds.length === 0) {
      setApproveAllMessage("No pending leads to approve");
      return;
    }

    setApprovingAll(true);
    setApproveAllMessage(null);
    try {
      const results = await Promise.all(
        pendingIds.map(async (leadId) => {
          try {
            const res = await fetch(
              `/api/extracted-leads/${leadId}/approve`,
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

      const approvedCount = results.filter(Boolean).length;
      const failedCount = results.length - approvedCount;

      setApproveAllMessage(
        failedCount === 0
          ? `Approved ${approvedCount} lead(s)`
          : `Approved ${approvedCount} lead(s), ${failedCount} failed`
      );
      await fetchData();
    } finally {
      setApprovingAll(false);
    }
  }, [fetchData, leads]);

  const stats = useMemo(() => {
    const pending = leads.filter((l) => l.reviewStatus === "pending").length;
    const approved = leads.filter((l) => l.reviewStatus === "approved").length;
    const rejected = leads.filter((l) => l.reviewStatus === "rejected").length;
    const classified = leads.filter(
      (l) => l.gicsClassificationKey && l.gicsClassificationKey.length > 0
    ).length;

    const enrichmentTotal = leads.length;
    const enrichmentPending = leads.filter(
      (l) => l.enrichmentStatus === "pending"
    ).length;
    const enrichmentDone = leads.filter(
      (l) =>
        l.enrichmentStatus === "enriched" ||
        l.enrichmentStatus === "failed" ||
        l.enrichmentStatus === "skipped"
    ).length;

    return {
      pending,
      approved,
      rejected,
      classified,
      enrichmentTotal,
      enrichmentPending,
      enrichmentDone,
    };
  }, [leads]);

  if (!imp) {
    return <p className="text-muted-foreground">Loading import…</p>;
  }

  const filePct =
    imp.totalItems > 0
      ? Math.min(100, Math.round((imp.processedItems / imp.totalItems) * 100))
      : 0;

  const enrichmentPct =
    stats.enrichmentTotal > 0
      ? Math.min(
          100,
          Math.round((stats.enrichmentDone / stats.enrichmentTotal) * 100)
        )
      : 0;

  const isSaving =
    imp.status === "uploaded" ||
    imp.status === "processing" ||
    (imp.totalItems > 0 && imp.processedItems < imp.totalItems);

  const savingComplete = !isSaving;
  const enrichmentActive =
    savingComplete &&
    stats.enrichmentTotal > 0 &&
    stats.enrichmentPending > 0;
  const enrichmentComplete =
    savingComplete &&
    stats.enrichmentTotal > 0 &&
    stats.enrichmentPending === 0;

  type Phase = "saving" | "enrichment" | "complete";
  const phase: Phase = isSaving
    ? "saving"
    : enrichmentActive
      ? "enrichment"
      : "complete";

  const showPhasePanel =
    isSaving || enrichmentActive || (enrichmentComplete && phase === "complete");

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
                <span className="text-sm text-muted-foreground">
                  {imp.processedItems} / {imp.totalItems} processed
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {stats.pending > 0 && (
                <Link
                  href={`/imports/${id}/review/${
                    leads.find((l) => l.reviewStatus === "pending")?.id ?? ""
                  }`}
                  className={cn(buttonVariants())}
                >
                  Start review ({stats.pending} pending)
                </Link>
              )}
              <Button
                type="button"
                variant="secondary"
                onClick={() => void approveAllPending()}
                disabled={approvingAll || stats.pending === 0}
                className="border-transparent text-[color:color-mix(in_oklab,var(--brand-green)_70%,black)] shadow-[0_1px_2px_rgba(15,40,30,0.08)] hover:brightness-105 disabled:opacity-60"
                style={{
                  background:
                    "linear-gradient(135deg, color-mix(in oklab, var(--brand-marigold) 95%, white) 0%, color-mix(in oklab, var(--brand-marigold) 80%, var(--brand-green) 20%) 100%)",
                }}
              >
                <CheckCheck className="h-4 w-4" />
                {approvingAll
                  ? "Approving…"
                  : `Approve all (${stats.pending})`}
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
            </div>
          </div>

          {showPhasePanel && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
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

              {phase === "saving" && (
                <div>
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Database className="h-3.5 w-3.5 text-[var(--brand-green)]" />
                      Saving to database
                    </span>
                    <span>
                      {filePct}% · {imp.processedItems} / {imp.totalItems}
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
                    <span>
                      {enrichmentPct}% · {stats.enrichmentDone} /{" "}
                      {stats.enrichmentTotal}
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
            </div>
          )}

          {(approveAllMessage || reclassifyMessage || reEnrichMessage) && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {approveAllMessage && (
                <span className="brand-pill">
                  <CheckCheck className="h-3 w-3" />
                  {approveAllMessage}
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
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat label="Pending" value={stats.pending} tone="muted" />
        <MiniStat label="Approved" value={stats.approved} tone="success" />
        <MiniStat label="Rejected" value={stats.rejected} tone="danger" />
        <MiniStat label="Classified" value={stats.classified} tone="brand" />
      </div>

      <section className="app-panel">
        <div className="app-panel-header">
          <h3 className="text-base font-semibold">Extracted leads</h3>
          <p className="text-xs text-muted-foreground">
            Review and approve. Approved leads dedupe into your Leads workspace.
          </p>
        </div>
        <div className="app-panel-body p-0">
          <ExtractedLeadTable leads={leads} importId={id} />
        </div>
      </section>
    </div>
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
