"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CardReviewForm,
  type ReviewFormValues,
} from "@/components/card-review-form";
import type { ExtractedLead, Import } from "@/lib/db/schema";

export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();
  const importId = params.id as string;
  const itemId = params.itemId as string;

  const [lead, setLead] = useState<ExtractedLead | null>(null);
  const [imp, setImp] = useState<Import | null>(null);
  const [allLeads, setAllLeads] = useState<ExtractedLead[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLead = useCallback(async () => {
    const res = await fetch(`/api/extracted-leads/${itemId}`);
    const data = await res.json();
    if (res.ok) {
      setLead(data.extractedLead);
      setImp(data.import);
    }
  }, [itemId]);

  const fetchAll = useCallback(async () => {
    const res = await fetch(`/api/imports/${importId}`);
    const data = await res.json();
    if (res.ok) setAllLeads(data.extractedLeads ?? []);
  }, [importId]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void fetchLead();
      void fetchAll();
    }, 0);
    return () => clearTimeout(timeout);
  }, [fetchLead, fetchAll]);

  const goToNextPending = useCallback(() => {
    const pending = allLeads.filter(
      (l) => l.reviewStatus === "pending" && l.id !== itemId
    );
    if (pending[0]) {
      router.push(`/imports/${importId}/review/${pending[0].id}`);
    } else {
      router.push(`/imports/${importId}`);
    }
  }, [allLeads, importId, itemId, router]);

  const approve = async (values: ReviewFormValues) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/extracted-leads/${itemId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Approve failed");
      toast.success("Lead approved");
      goToNextPending();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setLoading(false);
    }
  };

  const reject = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/extracted-leads/${itemId}/reject`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Reject failed");
      }
      toast.success("Lead rejected");
      goToNextPending();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reject failed");
    } finally {
      setLoading(false);
    }
  };

  const saveNext = async (values: ReviewFormValues) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/extracted-leads/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Save failed");
      }
      toast.success("Saved");
      goToNextPending();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setLoading(false);
    }
  };

  if (!lead) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  const pendingCount = allLeads.filter((l) => l.reviewStatus === "pending").length;
  const totalCount = allLeads.length;

  return (
    <div className="space-y-6">
      <Link
        href={`/imports/${importId}`}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "-ml-2"
        )}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to import
      </Link>

      <section className="app-panel">
        <div className="app-panel-body flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Review lead
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">
              {lead.name || lead.company || "Untitled lead"}
            </h2>
            {imp && (
              <p className="mt-1 text-sm text-muted-foreground">{imp.fileName}</p>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="brand-pill">{pendingCount} pending</span>
            <span className="brand-pill">{totalCount} total</span>
          </div>
        </div>
      </section>

      <CardReviewForm
        lead={lead}
        onApprove={approve}
        onReject={reject}
        onSaveNext={saveNext}
        loading={loading}
      />
    </div>
  );
}
