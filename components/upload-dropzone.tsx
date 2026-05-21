"use client";

import { useCallback, useState } from "react";
import { FileSpreadsheet, FileText, Upload } from "lucide-react";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VERCEL_DIRECT_UPLOAD_MAX_BYTES } from "@/lib/imports/settings";

const STANDARD_MAX_BYTES = 50 * 1024 * 1024;
const MULTIPART_MAX_BYTES = 500 * 1024 * 1024;

type Props = {
  onUploaded?: () => void;
};

export function UploadDropzone({ onUploaded }: Props) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const uploadMultipart = useCallback(async (file: File) => {
    const initRes = await fetch("/api/uploads/multipart/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        fileSize: file.size,
        contentType: file.type || "application/octet-stream",
      }),
    });
    const initData = await initRes.json();
    if (!initRes.ok) {
      throw new Error(initData.error ?? "Failed to start large upload");
    }

    const {
      importId,
      fileKey,
      uploadId,
      partSize,
      partCount,
      sourceType,
      processingMode,
    } = initData as {
      importId: string;
      fileKey: string;
      uploadId: string;
      partSize: number;
      partCount: number;
      sourceType: "pdf" | "xlsx";
      processingMode: "large";
    };

    const completedParts: Array<{ partNumber: number; etag: string }> = [];

    try {
      for (let partNumber = 1; partNumber <= partCount; partNumber += 1) {
        const partRes = await fetch("/api/uploads/multipart/part", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileKey, uploadId, partNumber }),
        });
        const partData = await partRes.json();
        if (!partRes.ok) {
          throw new Error(partData.error ?? `Failed to sign part ${partNumber}`);
        }

        const start = (partNumber - 1) * partSize;
        const end = Math.min(start + partSize, file.size);
        const chunk = file.slice(start, end);

        let etag: string | null = null;
        try {
          // Fast path: upload directly to R2 via signed URL.
          const putRes = await fetch(partData.url as string, {
            method: "PUT",
            body: chunk,
          });
          if (!putRes.ok) {
            throw new Error(`Upload failed for part ${partNumber}`);
          }
          etag = putRes.headers.get("ETag")?.replace(/"/g, "") ?? null;
        } catch {
          // Fallback path: tunnel part upload via our API if direct fetch is
          // blocked by CORS/network policy in the browser.
          const fallbackRes = await fetch(
            `/api/uploads/multipart/part?fileKey=${encodeURIComponent(
              fileKey
            )}&uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`,
            {
              method: "PUT",
              body: chunk,
            }
          );
          const fallbackData = await fallbackRes
            .json()
            .catch(() => ({ error: "Multipart fallback failed" }));
          if (!fallbackRes.ok) {
            throw new Error(
              fallbackData.error ?? `Upload failed for part ${partNumber}`
            );
          }
          etag = String(fallbackData.etag ?? "").replace(/"/g, "") || null;
        }

        if (!etag) throw new Error(`Missing ETag for part ${partNumber}`);
        completedParts.push({ partNumber, etag });
        setProgress(Math.round((partNumber / partCount) * 100));
      }

      const completeRes = await fetch("/api/uploads/multipart/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          importId,
          fileKey,
          fileName: file.name,
          fileSize: file.size,
          sourceType,
          uploadId,
          parts: completedParts,
          processingMode,
        }),
      });
      const completeData = await completeRes.json();
      if (!completeRes.ok) {
        throw new Error(completeData.error ?? "Failed to finalize upload");
      }
    } catch (err) {
      await fetch("/api/uploads/multipart/abort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileKey, uploadId }),
      }).catch(() => undefined);
      throw err;
    }
  }, []);

  const uploadStandard = useCallback(async (file: File) => {
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
  }, []);

  const upload = useCallback(
    async (file: File) => {
      if (file.size > MULTIPART_MAX_BYTES) {
        toast.error("File exceeds 500MB limit");
        return;
      }

      setUploading(true);
      setProgress(0);
      try {
        if (file.size > VERCEL_DIRECT_UPLOAD_MAX_BYTES) {
          await uploadMultipart(file);
        } else {
          await uploadStandard(file);
        }
        toast.success(`Uploaded ${file.name}`);
        onUploaded?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
        setProgress(0);
      }
    },
    [onUploaded, uploadMultipart, uploadStandard]
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

      <div className="relative flex h-14 w-14 items-center justify-center rounded-md border border-brand-marigold/30 bg-brand-marigold-soft/60 text-brand-green shadow-sm">
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
        <span>
          Up to 4&nbsp;MB direct · larger files via R2 · max 500&nbsp;MB PDF
        </span>
      </div>

      {uploading && progress > 0 && (
        <div className="relative w-full max-w-xs space-y-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${progress}%`,
                background:
                  "linear-gradient(90deg, var(--brand-green), var(--brand-marigold))",
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{progress}% uploaded</p>
        </div>
      )}

      <label
        className={cn(
          buttonVariants({ size: "lg" }),
          "relative cursor-pointer",
          uploading && "pointer-events-none opacity-70"
        )}
      >
        {uploading ? (progress > 0 ? `Uploading ${progress}%…` : "Uploading…") : "Choose file"}
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
