"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { TaxonomyPicker } from "@/components/taxonomy-picker";
import { fieldConfidenceClass } from "@/components/confidence-badge";
import { cn } from "@/lib/utils";
import { gicsToDbFields } from "@/lib/taxonomy/gics-fields";
import type { GicsEntry } from "@/lib/taxonomy/gics";
import type { ExtractedLead } from "@/lib/db/schema";

const formSchema = z.object({
  displayName: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  title: z.string().optional(),
  company: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  mobile: z.string().optional(),
  website: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  zipCode: z.string().optional(),
  country: z.string().optional(),
  annualRevenue: z.string().optional(),
  employeeHeadcount: z.string().optional(),
  gicsClassificationKey: z.string().optional(),
  gicsSector: z.string().optional(),
  gicsIndustryGroup: z.string().optional(),
  gicsIndustry: z.string().optional(),
  gicsSubIndustry: z.string().optional(),
  gicsSubIndustryDescription: z.string().optional(),
});

export type ReviewFormValues = z.infer<typeof formSchema>;

type FieldConfidence = {
  value: string | null;
  confidence: number;
  source: string;
  unreadable: boolean;
};

type Props = {
  lead: ExtractedLead;
  onApprove: (values: ReviewFormValues) => Promise<void>;
  onReject: () => Promise<void>;
  onSaveNext: (values: ReviewFormValues) => Promise<void>;
  loading?: boolean;
};

function getFieldConfidence(
  lead: ExtractedLead,
  field: string
): FieldConfidence | undefined {
  const fc = lead.fieldConfidence as Record<string, FieldConfidence> | null;
  return fc?.[field];
}

function applyGicsEntry(
  setValue: ReturnType<typeof useForm<ReviewFormValues>>["setValue"],
  entry: GicsEntry
) {
  const fields = gicsToDbFields(entry);
  setValue("gicsClassificationKey", fields.gicsClassificationKey);
  setValue("gicsSector", fields.gicsSector);
  setValue("gicsIndustryGroup", fields.gicsIndustryGroup);
  setValue("gicsIndustry", fields.gicsIndustry);
  setValue("gicsSubIndustry", fields.gicsSubIndustry);
  setValue("gicsSubIndustryDescription", fields.gicsSubIndustryDescription);
}

type FieldDef = {
  key: keyof ReviewFormValues;
  label: string;
  fcKey?: string;
  textarea?: boolean;
};

const PERSON_FIELDS: FieldDef[] = [
  { key: "displayName", label: "Display name", fcKey: "name" },
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "title", label: "Position", fcKey: "title" },
];

const CONTACT_FIELDS: FieldDef[] = [
  { key: "email", label: "Email", fcKey: "emails" },
  { key: "phone", label: "Office telephone", fcKey: "phones" },
  { key: "mobile", label: "Mobile" },
  { key: "website", label: "Website", fcKey: "websites" },
];

const COMPANY_FIELDS: FieldDef[] = [
  { key: "company", label: "Company", fcKey: "company" },
  { key: "annualRevenue", label: "Annual revenue" },
  { key: "employeeHeadcount", label: "Employee headcount" },
];

const LOCATION_FIELDS: FieldDef[] = [
  { key: "address", label: "Address", fcKey: "address" },
  { key: "city", label: "City" },
  { key: "zipCode", label: "Zip / Postal code" },
  { key: "country", label: "Country" },
];

export function CardReviewForm({
  lead,
  onApprove,
  onReject,
  onSaveNext,
  loading,
}: Props) {
  const form = useForm<ReviewFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      displayName: lead.displayName ?? lead.name ?? "",
      firstName: lead.firstName ?? "",
      lastName: lead.lastName ?? "",
      title: lead.title ?? "",
      company: lead.company ?? "",
      email: lead.email ?? "",
      phone: lead.phone ?? "",
      mobile: lead.mobile ?? "",
      website: lead.website ?? "",
      address: lead.address ?? "",
      city: lead.city ?? "",
      zipCode: lead.zipCode ?? "",
      country: lead.country ?? "",
      annualRevenue: lead.annualRevenue ?? "",
      employeeHeadcount: lead.employeeHeadcount ?? "",
      gicsClassificationKey: lead.gicsClassificationKey ?? "",
      gicsSector: lead.gicsSector ?? "",
      gicsIndustryGroup: lead.gicsIndustryGroup ?? "",
      gicsIndustry: lead.gicsIndustry ?? "",
      gicsSubIndustry: lead.gicsSubIndustry ?? "",
      gicsSubIndustryDescription: lead.gicsSubIndustryDescription ?? "",
    },
  });

  const issues =
    (lead.issues as { field: string; severity: string; message: string }[]) ??
    [];

  const gicsSector = form.watch("gicsSector");
  const gicsIndustryGroup = form.watch("gicsIndustryGroup");
  const gicsIndustry = form.watch("gicsIndustry");
  const gicsSubIndustry = form.watch("gicsSubIndustry");
  const gicsSubIndustryDescription = form.watch("gicsSubIndustryDescription");

  const renderField = ({ key, label, fcKey, textarea }: FieldDef) => {
    const fc = fcKey ? getFieldConfidence(lead, fcKey) : undefined;
    return (
      <div key={key} className="space-y-1.5">
        <Label htmlFor={key}>{label}</Label>
        {textarea ? (
          <textarea
            id={key}
            {...form.register(key)}
            rows={3}
            className={cn(
              "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50",
              fc ? fieldConfidenceClass(fc.confidence) : ""
            )}
          />
        ) : (
          <Input
            id={key}
            {...form.register(key)}
            className={cn(
              "border-2",
              fc ? fieldConfidenceClass(fc.confidence) : ""
            )}
          />
        )}
        {fc?.source === "vision_corrected" && (
          <p className="text-xs text-blue-600">AI corrected this field</p>
        )}
        {fc?.unreadable && (
          <p className="text-xs text-red-600">
            Could not verify — please check against image
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="app-panel relative min-h-[420px] overflow-hidden">
        {lead.cardImageUrl ? (
          <Image
            src={lead.cardImageUrl}
            alt="Business card"
            fill
            className="object-contain p-6"
            unoptimized
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <span
              className="inline-flex h-10 w-10 items-center justify-center rounded-md"
              style={{
                background:
                  "color-mix(in oklab, var(--brand-marigold) 18%, transparent)",
                color: "color-mix(in oklab, var(--brand-green) 80%, black)",
              }}
            >
              ★
            </span>
            <p className="text-sm font-medium">No card image</p>
            <p className="text-xs text-muted-foreground">
              Lead came from an Excel row.
            </p>
          </div>
        )}
      </div>

      <form
        className="app-panel app-panel-body space-y-6"
        onSubmit={form.handleSubmit(async (values) => onApprove(values))}
      >
        <FieldGroup title="Person" fields={PERSON_FIELDS.map(renderField)} />
        <FieldGroup title="Contact" fields={CONTACT_FIELDS.map(renderField)} />
        <FieldGroup title="Company" fields={COMPANY_FIELDS.map(renderField)} />
        <FieldGroup title="Location" fields={LOCATION_FIELDS.map(renderField)} />

        <div className="space-y-1.5">
          <Label>GICS classification</Label>
          <TaxonomyPicker
            value={form.watch("gicsClassificationKey")}
            onChange={(entry) => applyGicsEntry(form.setValue, entry)}
          />
          {(gicsSector || gicsSubIndustry) && (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-md border bg-muted/30 p-3 text-xs">
              <dt className="text-muted-foreground">Sector</dt>
              <dd>{gicsSector || "—"}</dd>
              <dt className="text-muted-foreground">Industry group</dt>
              <dd>{gicsIndustryGroup || "—"}</dd>
              <dt className="text-muted-foreground">Industry</dt>
              <dd>{gicsIndustry || "—"}</dd>
              <dt className="text-muted-foreground">Sub-industry</dt>
              <dd>{gicsSubIndustry || "—"}</dd>
              <dt className="text-muted-foreground col-span-2">Description</dt>
              <dd className="col-span-2 text-muted-foreground">
                {gicsSubIndustryDescription || "—"}
              </dd>
            </dl>
          )}
        </div>

        {issues.length > 0 && (
          <div className="space-y-1 rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3">
            <p className="text-sm font-medium">AI notes</p>
            {issues.map((issue, i) => (
              <p key={i} className="text-xs text-muted-foreground">
                <span className="font-medium">{issue.field}:</span>{" "}
                {issue.message}
              </p>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <Button type="submit" disabled={loading}>
            Approve
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={loading}
            onClick={form.handleSubmit(async (values) => onSaveNext(values))}
          >
            Save &amp; Next
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={loading}
            onClick={onReject}
          >
            Reject
          </Button>
        </div>
      </form>
    </div>
  );
}

function FieldGroup({
  title,
  fields,
}: {
  title: string;
  fields: React.ReactNode[];
}) {
  return (
    <section className="space-y-3">
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </h4>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{fields}</div>
    </section>
  );
}
