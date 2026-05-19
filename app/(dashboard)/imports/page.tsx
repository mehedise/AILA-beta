"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  FileUp,
  Trash2,
  XCircle,
} from "lucide-react";
import { UploadDropzone } from "@/components/upload-dropzone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Import } from "@/lib/db/schema";

function statusVariant(status: Import["status"]) {
  switch (status) {
    case "completed":
      return "default";
    case "failed":
      return "destructive";
    case "ready_for_review":
      return "secondary";
    default:
      return "outline";
  }
}

export default function ImportsPage() {
  const [imports, setImports] = useState<Import[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchImports = useCallback(async () => {
    try {
      const res = await fetch("/api/imports");
      const data = await res.json();
      if (res.ok) setImports(data.imports ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchImports();
    const interval = setInterval(fetchImports, 3000);
    return () => clearInterval(interval);
  }, [fetchImports]);

  useEffect(() => {
    if (selectedIds.size === 0) return;
    const live = new Set(imports.map((i) => i.id));
    let changed = false;
    const next = new Set<string>();
    for (const id of selectedIds) {
      if (live.has(id)) next.add(id);
      else changed = true;
    }
    if (changed) setSelectedIds(next);
  }, [imports, selectedIds]);

  useEffect(() => {
    if (selectedIds.size === 0) setBulkConfirm(false);
  }, [selectedIds]);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(t);
  }, [message]);

  const toggleOne = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const togglePage = useCallback(
    (checked: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const imp of imports) {
          if (checked) next.add(imp.id);
          else next.delete(imp.id);
        }
        return next;
      });
    },
    [imports]
  );

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const confirmBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setDeleting(true);
    setMessage(null);
    try {
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await fetch(`/api/imports/${id}`, { method: "DELETE" });
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
        setImports((prev) => prev.filter((i) => !removed.has(i.id)));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (const id of deleted) next.delete(id);
          return next;
        });
      }
      setMessage(
        failed === 0
          ? `Deleted ${deleted.length} import(s)`
          : `Deleted ${deleted.length} import(s), ${failed} failed`
      );
    } finally {
      setDeleting(false);
      setBulkConfirm(false);
    }
  }, [selectedIds]);

  const stats = useMemo(() => {
    const total = imports.length;
    const ready = imports.filter(
      (i) => i.status === "ready_for_review" || i.status === "completed"
    ).length;
    const processing = imports.filter(
      (i) => i.status === "processing" || i.status === "uploaded"
    ).length;
    const failed = imports.filter((i) => i.status === "failed").length;
    return { total, ready, processing, failed };
  }, [imports]);

  const selectionCount = selectedIds.size;
  const allPageSelected =
    imports.length > 0 && imports.every((i) => selectedIds.has(i.id));
  const somePageSelected =
    imports.some((i) => selectedIds.has(i.id)) && !allPageSelected;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Workspace
        </p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">Imports</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Drop in Excel spreadsheets or PDF business-card decks. AILA extracts,
              verifies, and classifies every lead with GICS 2023.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<FileUp className="h-4 w-4" />}
          label="Total imports"
          value={stats.total}
          tone="brand"
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Ready for review"
          value={stats.ready}
          tone="success"
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="Processing"
          value={stats.processing}
          tone="muted"
        />
        <StatCard
          icon={<XCircle className="h-4 w-4" />}
          label="Failed"
          value={stats.failed}
          tone="danger"
        />
      </div>

      <UploadDropzone onUploaded={fetchImports} />

      <section className="app-panel">
        <div className="app-panel-header flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">Recent imports</h3>
            <p className="text-xs text-muted-foreground">
              Auto-refreshing every few seconds while jobs run.
            </p>
          </div>
        </div>

        {imports.length > 0 && !loading && (
          <div
            className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 px-6 py-2.5 text-sm transition-colors"
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
                    {selectionCount} Selected
                  </span>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    Clear
                  </button>
                </>
              ) : (
                <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  0 Selected
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setBulkConfirm(true)}
                disabled={selectionCount === 0 || deleting}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            </div>
          </div>
        )}

        {bulkConfirm && selectionCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-destructive/30 bg-destructive/5 px-6 py-2.5 text-sm">
            <span className="text-foreground">
              Delete {selectionCount} selected import
              {selectionCount === 1 ? "" : "s"}? This also deletes all extracted
              leads from {selectionCount === 1 ? "it" : "them"}.
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBulkConfirm(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => void confirmBulkDelete()}
                disabled={deleting}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {deleting ? "Deleting…" : `Delete ${selectionCount}`}
              </Button>
            </div>
          </div>
        )}

        {message && (
          <div className="border-t border-border/70 bg-muted/40 px-6 py-2 text-xs text-muted-foreground">
            {message}
          </div>
        )}

        <div className="app-panel-body p-0">
          {loading ? (
            <p className="px-6 py-8 text-sm text-muted-foreground">Loading…</p>
          ) : imports.length === 0 ? (
            <p className="px-6 py-8 text-sm text-muted-foreground">
              No imports yet. Upload a file above to get started.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label={
                        allPageSelected ? "Deselect all" : "Select all"
                      }
                      checked={allPageSelected}
                      indeterminate={somePageSelected}
                      onCheckedChange={togglePage}
                    />
                  </TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {imports.map((imp) => {
                  const isSelected = selectedIds.has(imp.id);
                  return (
                    <TableRow
                      key={imp.id}
                      data-state={isSelected ? "selected" : undefined}
                      className={cn(
                        isSelected &&
                          "bg-[color:color-mix(in_oklab,var(--brand-marigold)_8%,transparent)]"
                      )}
                    >
                      <TableCell className="w-10">
                        <Checkbox
                          aria-label={
                            isSelected ? "Deselect import" : "Select import"
                          }
                          checked={isSelected}
                          onCheckedChange={(c) => toggleOne(imp.id, c)}
                        />
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/imports/${imp.id}`}
                          className="font-medium text-foreground transition-colors hover:text-primary"
                        >
                          {imp.fileName}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs uppercase tracking-wide text-muted-foreground">
                        {imp.sourceType}
                      </TableCell>
                      <TableCell>
                        {imp.status === "failed" && imp.error ? (
                          <Badge variant="destructive" title={imp.error}>
                            Failed
                          </Badge>
                        ) : (
                          <Badge variant={statusVariant(imp.status)}>
                            {imp.status.replace(/_/g, " ")}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <ProgressCell
                          processed={imp.processedItems}
                          total={imp.totalItems}
                        />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(imp.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/imports/${imp.id}`}
                          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                        >
                          Open <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </section>
    </div>
  );
}

type StatTone = "brand" | "success" | "muted" | "danger";

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: StatTone;
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
        className="inline-flex h-9 w-9 items-center justify-center rounded-md"
        style={{ background: t.bg, color: t.fg }}
      >
        {icon}
      </span>
      <div>
        <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </div>
        <div className="text-xl font-semibold">{value}</div>
      </div>
    </div>
  );
}

function ProgressCell({ processed, total }: { processed: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
  return (
    <div className="min-w-[160px]">
      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {processed} / {total}
        </span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${pct}%`,
            background:
              "linear-gradient(90deg, var(--brand-green), var(--brand-marigold))",
          }}
        />
      </div>
    </div>
  );
}
