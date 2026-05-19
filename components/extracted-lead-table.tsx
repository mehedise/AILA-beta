"use client";

import Link from "next/link";
import Image from "next/image";
import { Sparkles } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ConfidenceBadge } from "@/components/confidence-badge";
import type { ExtractedLead } from "@/lib/db/schema";

type Props = {
  leads: ExtractedLead[];
  importId: string;
};

function cell(value: string | null | undefined) {
  return value?.trim() || "—";
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

export function ExtractedLeadTable({ leads, importId }: Props) {
  if (leads.length === 0) {
    return (
      <p className="px-6 py-10 text-center text-sm text-muted-foreground">
        No extracted leads yet. Processing may still be in progress.
      </p>
    );
  }

  const enrichmentActive = leads.some(
    (lead) => lead.enrichmentStatus === "pending"
  );

  return (
    <div className="relative overflow-x-auto">
      {enrichmentActive && <div className="ai-scan-beam" aria-hidden />}
      <Table>
        <TableHeader>
          <TableRow>
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
          {leads.map((lead) => {
            const isEnriching = lead.enrichmentStatus === "pending";
            return (
            <TableRow key={lead.id} className={cn(isEnriching && "ai-row")}>
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
                    {lead.enrichmentStatus}
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
              <TableCell>
                <Link
                  href={`/imports/${importId}/review/${lead.id}`}
                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                >
                  Review
                </Link>
              </TableCell>
            </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
