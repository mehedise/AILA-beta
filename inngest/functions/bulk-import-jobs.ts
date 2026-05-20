import { and, eq, inArray } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db/client";
import {
  extractedLeads,
  importBulkJobs,
  imports,
  leads,
} from "@/lib/db/schema";
import { buildDedupeKey } from "@/lib/dedupe";
import {
  normalizeEmail,
  normalizePhone,
  normalizeWebsite,
} from "@/lib/excel/normalize";
import { resolveGicsFields } from "@/lib/taxonomy/resolve-gics";
import { putObjectFromBuffer, getSignedReadUrl } from "@/lib/storage/r2";
const BATCH_SIZE = 100;

async function updateBulkJob(
  jobId: string,
  patch: Partial<{
    status: "running" | "completed" | "failed";
    processedCount: number;
    totalCount: number;
    error: string;
    result: Record<string, unknown>;
  }>
) {
  await db
    .update(importBulkJobs)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(importBulkJobs.id, jobId));
}

export const bulkApproveImport = inngest.createFunction(
  {
    id: "bulk-approve-import",
    retries: 2,
    triggers: [{ event: "import/bulk.approve" }],
  },
  async ({ event, step }) => {
    const { jobId, importId, userId } = event.data as {
      jobId: string;
      importId: string;
      userId: string;
    };

    await step.run("mark-running", () =>
      updateBulkJob(jobId, { status: "running" })
    );

    const pending = await step.run("fetch-pending", async () =>
      db
        .select()
        .from(extractedLeads)
        .where(
          and(
            eq(extractedLeads.importId, importId),
            eq(extractedLeads.reviewStatus, "pending")
          )
        )
    );

    await step.run("init-total", () =>
      updateBulkJob(jobId, { totalCount: pending.length, processedCount: 0 })
    );

    let processed = 0;
    let failed = 0;

    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const chunk = pending.slice(i, i + BATCH_SIZE);
      await step.run(`approve-${i}`, async () => {
        for (const row of chunk) {
          try {
            const gics = resolveGicsFields({}, row);
            const displayName = row.displayName ?? row.name;
            const leadData = {
              displayName,
              firstName: row.firstName,
              lastName: row.lastName,
              name:
                displayName ||
                [row.firstName, row.lastName].filter(Boolean).join(" ").trim() ||
                row.name,
              title: row.title,
              company: row.company,
              email: normalizeEmail(row.email),
              phone: normalizePhone(row.phone),
              mobile: normalizePhone(row.mobile),
              website: normalizeWebsite(row.website),
              address: row.address,
              city: row.city,
              zipCode: row.zipCode,
              country: row.country,
              annualRevenue: row.annualRevenue,
              employeeHeadcount: row.employeeHeadcount,
              logoUrl: row.logoUrl,
              enrichmentStatus: row.enrichmentStatus,
              enrichmentJson: row.enrichmentJson,
              ...gics,
            };
            const dedupeKey = buildDedupeKey(leadData);
            const [existingLead] = await db
              .select()
              .from(leads)
              .where(eq(leads.dedupeKey, dedupeKey));

            if (existingLead) {
              await db
                .update(leads)
                .set({ ...leadData, updatedAt: new Date() })
                .where(eq(leads.id, existingLead.id));
            } else {
              await db.insert(leads).values({
                userId,
                ...leadData,
                sourceExtractedLeadId: row.id,
                dedupeKey,
              });
            }

            await db
              .update(extractedLeads)
              .set({ reviewStatus: "approved", ...leadData })
              .where(eq(extractedLeads.id, row.id));
            processed += 1;
          } catch {
            failed += 1;
          }
        }
        await updateBulkJob(jobId, { processedCount: processed });
      });
    }

    await step.run("complete", () =>
      updateBulkJob(jobId, {
        status: "completed",
        processedCount: processed,
        result: { approved: processed, failed },
      })
    );

    return { jobId, processed, failed };
  }
);

export const bulkExportImport = inngest.createFunction(
  {
    id: "bulk-export-import",
    retries: 2,
    triggers: [{ event: "import/bulk.export" }],
  },
  async ({ event, step }) => {
    const { jobId, importId } = event.data as {
      jobId: string;
      importId: string;
    };

    await step.run("mark-running", () =>
      updateBulkJob(jobId, { status: "running" })
    );

    const rows = await step.run("fetch-rows", async () =>
      db
        .select()
        .from(extractedLeads)
        .where(eq(extractedLeads.importId, importId))
    );

    const csv = await step.run("build-csv", () => {
      const headers = [
        "displayName",
        "firstName",
        "lastName",
        "title",
        "company",
        "email",
        "phone",
        "reviewStatus",
        "enrichmentStatus",
        "confidence",
        "pageNumber",
      ];
      const escape = (v: unknown) => {
        if (v === null || v === undefined) return "";
        const s = String(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      return [
        headers.join(","),
        ...rows.map((r) =>
          headers.map((h) => escape(r[h as keyof typeof r])).join(",")
        ),
      ].join("\n");
    });

    const key = await step.run("upload-csv", async () => {
      const exportKey = `imports/${importId}/exports/${jobId}.csv`;
      await putObjectFromBuffer(
        exportKey,
        Buffer.from(`\uFEFF${csv}`, "utf-8"),
        "text/csv;charset=utf-8"
      );
      return exportKey;
    });

    const downloadUrl = await step.run("sign-url", () =>
      getSignedReadUrl(key, 86400)
    );

    await step.run("complete", () =>
      updateBulkJob(jobId, {
        status: "completed",
        totalCount: rows.length,
        processedCount: rows.length,
        result: { downloadUrl, rowCount: rows.length },
      })
    );

    return { jobId, rowCount: rows.length };
  }
);

export const bulkEnrichImport = inngest.createFunction(
  {
    id: "bulk-enrich-import",
    retries: 2,
    triggers: [{ event: "import/bulk.enrich" }],
  },
  async ({ event, step }) => {
    const { jobId, importId } = event.data as {
      jobId: string;
      importId: string;
    };

    await step.run("mark-running", async () => {
      await db
        .update(imports)
        .set({ status: "enriching" })
        .where(eq(imports.id, importId));
      await updateBulkJob(jobId, { status: "running" });
    });

    const pending = await step.run("fetch-pending", async () =>
      db
        .select({ id: extractedLeads.id })
        .from(extractedLeads)
        .where(
          and(
            eq(extractedLeads.importId, importId),
            inArray(extractedLeads.enrichmentStatus, ["pending", "failed"])
          )
        )
    );

    await step.run("init-total", () =>
      updateBulkJob(jobId, { totalCount: pending.length })
    );

    if (pending.length > 0) {
      await step.sendEvent(
        "queue-enrich",
        pending.map((row) => ({
          name: "lead/enrich.requested" as const,
          data: { extractedLeadId: row.id },
        }))
      );
    }

    await step.run("complete", () =>
      updateBulkJob(jobId, {
        status: "completed",
        processedCount: 0,
        result: { queued: pending.length },
      })
    );

    return { jobId, queued: pending.length };
  }
);
