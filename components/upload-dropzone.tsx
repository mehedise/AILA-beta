"use client";

import { useCallback, useState } from "react";
import { FileSpreadsheet, FileText, Upload } from "lucide-react";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  onUploaded?: () => void;
};

export function UploadDropzone({ onUploaded }: Props) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const upload = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: form });
        const raw = await res.text();
        let data: { error?: string } = {};
        if (raw) {
          try {
            data = JSON.parse(raw) as { error?: string };
          } catch {
            data = { error: "Server returned an invalid response" };
          }
        }
        if (!res.ok) throw new Error(data.error ?? "Upload failed");
        toast.success(`Uploaded ${file.name}`);
        onUploaded?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [onUploaded]
  );

  return (
    <div
      className={cn(
        "group relative flex flex-col items-center justify-center gap-4 overflow-hidden rounded-lg border border-dashed bg-card/70 px-6 py-12 text-center transition-all",
        dragging
          ? "border-accent bg-accent/10 shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_18%,transparent)]"
          : "border-border hover:border-accent/60 hover:bg-card",
        uploading && "pointer-events-none opacity-70"
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) upload(file);
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(circle at 50% 0%, color-mix(in oklab, var(--brand-marigold) 10%, transparent) 0%, transparent 60%)",
        }}
      />

      <div
        className="relative flex h-14 w-14 items-center justify-center rounded-md border border-brand-marigold/30 bg-brand-marigold-soft/60 text-brand-green shadow-sm"
      >
        <Upload className="h-6 w-6" />
      </div>

      <div className="relative space-y-1">
        <p className="text-base font-semibold">Drop a file to start an import</p>
        <p className="text-sm text-muted-foreground">
          Excel spreadsheets (.xlsx/.xls) or PDFs with one business card per page.
        </p>
      </div>

      <div className="relative flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-background/60 px-2 py-0.5">
          <FileSpreadsheet className="h-3 w-3" /> Excel
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-background/60 px-2 py-0.5">
          <FileText className="h-3 w-3" /> PDF
        </span>
        <span className="text-muted-foreground/70">·</span>
        <span>Up to 50&nbsp;MB</span>
      </div>

      <label
        className={cn(
          buttonVariants({ size: "lg" }),
          "relative cursor-pointer",
          uploading && "pointer-events-none opacity-70"
        )}
      >
        {uploading ? "Uploading…" : "Choose file"}
        <input
          type="file"
          className="hidden"
          accept=".xlsx,.xls,.pdf"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );
}
