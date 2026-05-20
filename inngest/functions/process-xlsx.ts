import { eq, inArray } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db/client";
import { extractedLeads, imports } from "@/lib/db/schema";
import { needsInferenceEnrichment } from "@/lib/ai/enrich";
import { getObjectBuffer } from "@/lib/storage/r2";
import { parseExcelBuffer } from "@/lib/excel/parse";
import {
  logoFromWebsite,
  normalizeEmail,
  normalizePhone,
  normalizeWebsite,
} from "@/lib/excel/normalize";

export const processXlsx = inngest.createFunction(
  {
    id: "process-xlsx",
    retries: 3,
    triggers: [{ event: "import/uploaded" }],
  },
  async ({ event, step }) => {
    const { importId, fileKey, sourceType } = event.data as {
      importId: string;
      fileKey: string;
      sourceType: string;
    };

    if (sourceType !== "xlsx") return { skipped: true };

    await step.run("mark-processing", async () => {
      await db
        .update(imports)
        .set({ status: "processing" })
        .where(eq(imports.id, importId));
    });

    try {
      const rows = await step.run("parse-xlsx", async () => {
        const buf = await getObjectBuffer(fileKey);
        return parseExcelBuffer(buf);
      });

      await step.run("set-total", async () => {
        await db
          .update(imports)
          .set({ totalItems: rows.length, processedItems: 0 })
          .where(eq(imports.id, importId));
      });

      const enrichmentIds: string[] = [];
      const classifyOnlyIds: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const id = await step.run(`insert-row-${i}`, async () => {
          const email = normalizeEmail(row.email);
          const phone = normalizePhone(row.phone);
          const mobile = normalizePhone(row.mobile);
          const website = normalizeWebsite(row.website);
          const logoUrl = row.logo || logoFromWebsite(website);

          const [inserted] = await db
            .insert(extractedLeads)
            .values({
              importId,
              name: row.name,
              displayName: row.displayName,
              firstName: row.firstName,
              lastName: row.lastName,
              title: row.title,
              company: row.company,
              email,
              phone,
              mobile,
              website,
              logoUrl,
              address: row.address,
              city: row.city,
              zipCode: row.zipCode,
              country: row.country,
              annualRevenue: row.annualRevenue,
              employeeHeadcount: row.employeeHeadcount,
              rawJson: row.raw,
              extractionMethod: "xlsx",
              reviewStatus: "pending",
              enrichmentStatus: "pending",
              confidence: "0.95",
            })
            .returning({ id: extractedLeads.id });

          await db
            .update(imports)
            .set({ processedItems: i + 1 })
            .where(eq(imports.id, importId));

          return inserted.id;
        });

        const shouldEnrich = needsInferenceEnrichment({
          displayName: row.displayName ?? row.name,
          firstName: row.firstName,
          lastName: row.lastName,
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
        });

        if (shouldEnrich) enrichmentIds.push(id);
        else classifyOnlyIds.push(id);
      }

      if (enrichmentIds.length === 0 && classifyOnlyIds.length === 0) {
        await step.run("mark-ready", async () => {
          await db
            .update(imports)
            .set({ status: "ready_for_review" })
            .where(eq(imports.id, importId));
        });
        return { importId, rows: rows.length };
      }

      await step.run("mark-post-processing", async () => {
        await db
          .update(imports)
          .set({ status: "enriching" })
          .where(eq(imports.id, importId));
      });

      if (classifyOnlyIds.length > 0) {
        await step.run("mark-enrichment-skipped", async () => {
          await db
            .update(extractedLeads)
            .set({
              enrichmentStatus: "skipped",
              enrichmentJson: {
                mode: "inference",
                notes: "no_inference_fillable_missing_fields",
              },
            })
            .where(inArray(extractedLeads.id, classifyOnlyIds));
        });

        await step.sendEvent(
          "classify-only",
          classifyOnlyIds.map((extractedLeadId) => ({
            name: "lead/classify.requested" as const,
            data: { extractedLeadId },
          }))
        );
      }

      if (enrichmentIds.length === 0) {
        return { importId, rows: rows.length };
      }

      await step.sendEvent(
        "enqueue-enrich",
        enrichmentIds.map((extractedLeadId) => ({
          name: "lead/enrich.requested" as const,
          data: { extractedLeadId },
        }))
      );

      return { importId, rows: rows.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await db
        .update(imports)
        .set({ status: "failed", error: message })
        .where(eq(imports.id, importId));
      throw err;
    }
  }
);
