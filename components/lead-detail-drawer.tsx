"use client";

import * as React from "react";
import Link from "next/link";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  Building2,
  Calendar,
  Globe,
  Layers,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Smartphone,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Lead } from "@/lib/db/schema";

type Props = {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate?: (lead: Lead) => void;
  onDelete?: (id: string) => void;
};

const EDITABLE_FIELDS = [
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
] as const;

type EditableField = (typeof EDITABLE_FIELDS)[number];

export function LeadDetailDrawer({
  lead,
  open,
  onOpenChange,
  onUpdate,
  onDelete,
}: Props) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-black/30 supports-backdrop-filter:backdrop-blur-[2px]",
            "duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
          )}
        />
        <DialogPrimitive.Popup
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-[560px] flex-col bg-card shadow-[0_20px_60px_-20px_rgba(15,40,30,0.35)] ring-1 ring-border/60",
            "duration-200 data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right"
          )}
        >
          {lead ? (
            <DrawerBody
              key={lead.id}
              lead={lead}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onClose={() => onOpenChange(false)}
            />
          ) : null}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

type Mode = "view" | "edit" | "confirm-delete";

function DrawerBody({
  lead,
  onUpdate,
  onDelete,
  onClose,
}: {
  lead: Lead;
  onUpdate?: (lead: Lead) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = React.useState<Mode>("view");
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<Record<EditableField, string>>(
    () => initialDraft(lead)
  );

  React.useEffect(() => {
    setDraft(initialDraft(lead));
    setMode("view");
    setError(null);
  }, [lead]);

  const setField = (key: EditableField, value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, string | null> = {};
      for (const key of EDITABLE_FIELDS) {
        const next = draft[key].trim();
        payload[key] = next === "" ? null : next;
      }
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to save");
        return;
      }
      if (data.lead) onUpdate?.(data.lead as Lead);
      setMode("view");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to delete");
        return;
      }
      onDelete?.(lead.id);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  const displayName = lead.displayName ?? lead.name ?? "Untitled lead";
  const positionAtCompany = [lead.title, lead.company]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <header className="flex items-start justify-between gap-3 border-b border-border/70 px-6 py-5">
        <div className="min-w-0 space-y-1.5">
          <DialogPrimitive.Title className="truncate text-xl font-semibold tracking-tight">
            {displayName}
          </DialogPrimitive.Title>
          {positionAtCompany && (
            <p className="truncate text-sm text-muted-foreground">
              {positionAtCompany}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {lead.gicsSector && (
              <Badge variant="outline" className="text-[11px]">
                {lead.gicsSector}
              </Badge>
            )}
            {lead.gicsIndustryGroup && (
              <Badge variant="outline" className="text-[11px]">
                {lead.gicsIndustryGroup}
              </Badge>
            )}
            {lead.enrichmentStatus === "enriched" && (
              <span className="brand-pill">
                <Sparkles className="h-3 w-3" />
                AI enriched
              </span>
            )}
          </div>
        </div>
        <DialogPrimitive.Close
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="-mr-1 mt-0.5"
              aria-label="Close"
            />
          }
        >
          <X className="h-4 w-4" />
        </DialogPrimitive.Close>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        {mode === "edit" ? (
          <EditForm draft={draft} onChange={setField} />
        ) : (
          <ViewSections lead={lead} />
        )}

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}
      </div>

      <footer className="border-t border-border/70 bg-muted/30 px-6 py-3">
        {mode === "confirm-delete" ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-foreground">
              Delete this lead? This cannot be undone.
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMode("view")}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => void remove()}
                disabled={deleting}
              >
                <Trash2 className="h-4 w-4" />
                {deleting ? "Deleting…" : "Delete lead"}
              </Button>
            </div>
          </div>
        ) : mode === "edit" ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(initialDraft(lead));
                setMode("view");
                setError(null);
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setMode("confirm-delete")}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
            <div className="flex items-center gap-2">
              <DialogPrimitive.Close
                render={<Button variant="ghost" size="sm" />}
              >
                Close
              </DialogPrimitive.Close>
              <Button size="sm" onClick={() => setMode("edit")}>
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            </div>
          </div>
        )}
      </footer>
    </>
  );
}

function initialDraft(lead: Lead): Record<EditableField, string> {
  const out = {} as Record<EditableField, string>;
  for (const key of EDITABLE_FIELDS) {
    out[key] = (lead[key] as string | null | undefined) ?? "";
  }
  return out;
}

const FIELD_GROUPS: {
  title: string;
  icon: React.ReactNode;
  fields: { key: EditableField; label: string; type?: string }[];
}[] = [
  {
    title: "Contact",
    icon: <Mail className="h-3.5 w-3.5" />,
    fields: [
      { key: "displayName", label: "Display name" },
      { key: "firstName", label: "First name" },
      { key: "lastName", label: "Last name" },
      { key: "title", label: "Position" },
      { key: "email", label: "Email", type: "email" },
      { key: "phone", label: "Office tel", type: "tel" },
      { key: "mobile", label: "Mobile", type: "tel" },
      { key: "website", label: "Website", type: "url" },
    ],
  },
  {
    title: "Company",
    icon: <Building2 className="h-3.5 w-3.5" />,
    fields: [
      { key: "company", label: "Company" },
      { key: "annualRevenue", label: "Annual revenue" },
      { key: "employeeHeadcount", label: "Headcount" },
    ],
  },
  {
    title: "Location",
    icon: <MapPin className="h-3.5 w-3.5" />,
    fields: [
      { key: "address", label: "Address" },
      { key: "city", label: "City" },
      { key: "zipCode", label: "Zip / Postal code" },
      { key: "country", label: "Country" },
    ],
  },
];

function EditForm({
  draft,
  onChange,
}: {
  draft: Record<EditableField, string>;
  onChange: (key: EditableField, value: string) => void;
}) {
  return (
    <>
      {FIELD_GROUPS.map((group) => (
        <Section key={group.title} title={group.title} icon={group.icon}>
          <div className="grid gap-3 sm:grid-cols-2">
            {group.fields.map((f) => (
              <div key={f.key} className="space-y-1.5 sm:[&:nth-child(1)]:col-span-2">
                <Label
                  htmlFor={`drawer-${f.key}`}
                  className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground"
                >
                  {f.label}
                </Label>
                <Input
                  id={`drawer-${f.key}`}
                  type={f.type ?? "text"}
                  value={draft[f.key]}
                  onChange={(e) => onChange(f.key, e.target.value)}
                  placeholder="—"
                />
              </div>
            ))}
          </div>
        </Section>
      ))}
    </>
  );
}

function ViewSections({ lead }: { lead: Lead }) {
  return (
    <>
      <Section title="Contact" icon={<Mail className="h-3.5 w-3.5" />}>
        <Row label="First name" value={lead.firstName} />
        <Row label="Last name" value={lead.lastName} />
        <Row label="Position" value={lead.title} />
        <Row label="Email" value={lead.email} type="email" />
        <Row
          label="Office tel"
          value={lead.phone}
          type="tel"
          icon={<Phone className="h-3 w-3" />}
        />
        <Row
          label="Mobile"
          value={lead.mobile}
          type="tel"
          icon={<Smartphone className="h-3 w-3" />}
        />
        <Row
          label="Website"
          value={lead.website}
          type="url"
          icon={<Globe className="h-3 w-3" />}
        />
      </Section>

      <Section title="Company" icon={<Building2 className="h-3.5 w-3.5" />}>
        <Row label="Company" value={lead.company} emphasize />
        <Row label="Annual revenue" value={lead.annualRevenue} />
        <Row label="Headcount" value={lead.employeeHeadcount} />
      </Section>

      <Section title="Location" icon={<MapPin className="h-3.5 w-3.5" />}>
        <Row label="Address" value={lead.address} />
        <Row label="City" value={lead.city} />
        <Row label="Zip / Postal code" value={lead.zipCode} />
        <Row label="Country" value={lead.country} />
      </Section>

      <Section
        title="GICS Classification"
        icon={<Layers className="h-3.5 w-3.5" />}
      >
        <Row label="Sector" value={lead.gicsSector} />
        <Row label="Industry group" value={lead.gicsIndustryGroup} />
        <Row label="Industry" value={lead.gicsIndustry} />
        <Row label="Sub-industry" value={lead.gicsSubIndustry} />
        {lead.gicsSubIndustryDescription && (
          <Row
            label="Description"
            value={lead.gicsSubIndustryDescription}
            multiline
          />
        )}
        {lead.gicsClassificationKey && (
          <Row
            label="Classification key"
            value={lead.gicsClassificationKey}
            mono
          />
        )}
      </Section>

      <Section
        title="AI Enrichment"
        icon={<Sparkles className="h-3.5 w-3.5" />}
      >
        <Row
          label="Status"
          value={lead.enrichmentStatus ?? "—"}
          emphasize
        />
        {lead.enrichmentJson && typeof lead.enrichmentJson === "object" ? (
          <EnrichmentJson json={lead.enrichmentJson as Record<string, unknown>} />
        ) : null}
      </Section>

      <Section title="Meta" icon={<Calendar className="h-3.5 w-3.5" />}>
        <Row
          label="Created"
          value={lead.createdAt ? formatDate(lead.createdAt) : null}
        />
        <Row
          label="Updated"
          value={lead.updatedAt ? formatDate(lead.updatedAt) : null}
        />
        {lead.sourceExtractedLeadId && (
          <div className="grid grid-cols-[120px_1fr] items-baseline gap-3 text-sm">
            <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Source
            </div>
            <Link
              href="/imports"
              className="truncate text-sm text-primary hover:underline"
              title={lead.sourceExtractedLeadId}
            >
              View originating import
            </Link>
          </div>
        )}
      </Section>
    </>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {icon}
        {title}
      </h3>
      <div className="space-y-2.5 rounded-lg border border-border/70 bg-background/60 p-4">
        {children}
      </div>
    </section>
  );
}

function Row({
  label,
  value,
  type,
  icon,
  emphasize,
  multiline,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  type?: "email" | "tel" | "url";
  icon?: React.ReactNode;
  emphasize?: boolean;
  multiline?: boolean;
  mono?: boolean;
}) {
  const v = value?.toString().trim();
  const isEmpty = !v;

  const valueClasses = cn(
    "min-w-0 break-words text-sm",
    emphasize ? "font-medium text-foreground" : "text-foreground",
    mono && "font-mono text-xs",
    isEmpty && "text-muted-foreground italic"
  );

  let content: React.ReactNode = isEmpty ? "—" : v;
  if (!isEmpty && type === "email" && v) {
    content = (
      <a href={`mailto:${v}`} className="text-primary hover:underline">
        {v}
      </a>
    );
  } else if (!isEmpty && type === "tel" && v) {
    content = (
      <a href={`tel:${v}`} className="text-primary hover:underline">
        {v}
      </a>
    );
  } else if (!isEmpty && type === "url" && v) {
    const href = v.startsWith("http") ? v : `https://${v}`;
    content = (
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className="text-primary hover:underline"
      >
        {v}
      </a>
    );
  }

  return (
    <div
      className={cn(
        "grid grid-cols-[120px_1fr] gap-3 text-sm",
        multiline ? "items-baseline" : "items-baseline"
      )}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={valueClasses}>{content}</div>
    </div>
  );
}

function EnrichmentJson({ json }: { json: Record<string, unknown> }) {
  const sources = json.fieldSources as
    | Record<string, string | null>
    | null
    | undefined;
  const notes = (json.notes as string | null) ?? null;
  const mode = (json.mode as string | null) ?? null;

  const sourceEntries = sources
    ? Object.entries(sources).filter(([, v]) => v && String(v).trim())
    : [];

  return (
    <>
      {mode && <Row label="Mode" value={mode} />}
      {notes && <Row label="Notes" value={notes} multiline />}
      {sourceEntries.length > 0 && (
        <div className="grid grid-cols-[120px_1fr] gap-3 text-sm">
          <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Sources
          </div>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {sourceEntries.map(([k, v]) => (
              <li key={k} className="min-w-0">
                <span className="font-medium text-foreground/80">{k}:</span>{" "}
                <span className="break-words">{String(v)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function formatDate(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
