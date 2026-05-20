import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { extractedLeads, imports } from "@/lib/db/schema";
import { structureCardFromText } from "@/lib/ai/structure-text";
import { verifyCardAgainstImage } from "@/lib/ai/verify-card";
import { flattenVerifiedCard } from "@/lib/ai/schemas";
import type { BusinessCardDraft, VerifiedCard } from "@/lib/ai/schemas";
import { MODEL } from "@/lib/ai/structure-text";
import {
  normalizeEmail,
  normalizePhone,
  normalizeWebsite,
  logoFromWebsite,
} from "@/lib/excel/normalize";
import { downloadPdfFromR2 } from "@/lib/pdf/load";
import { prerenderPdfChunk } from "@/lib/pdf/prerender";
import {
  getPageImageSignedUrl,
  readPageArtifact,
} from "@/lib/pdf/page-artifacts";
import { getImportSettings } from "@/lib/imports/get-settings";

const TEXT_RICH_THRESHOLD = 30;
const SKIP_VISION_CONFIDENCE = 0.7;

export async function isImportTerminated(importId: string): Promise<boolean> {
  const [imp] = await db
    .select({ status: imports.status })
    .from(imports)
    .where(eq(imports.id, importId));
  return imp?.status === "terminated";
}

async function loadPageData(
  importId: string,
  fileKey: string,
  pageNumber: number
) {
  let artifact = await readPageArtifact(importId, pageNumber);

  if (!artifact) {
    const pdfBuffer = await downloadPdfFromR2(fileKey);
    await prerenderPdfChunk(pdfBuffer, importId, pageNumber, pageNumber, {
      forceImage: true,
    });
    artifact = await readPageArtifact(importId, pageNumber);
  }

  const text = (artifact?.text ?? "").replace(/\s+/g, " ").trim();
  const useText = text.length >= TEXT_RICH_THRESHOLD;
  const hasImage = artifact?.hasImage ?? false;
  const imageUrl = hasImage
    ? await getPageImageSignedUrl(importId, pageNumber)
    : null;

  return {
    text,
    annotationUrls: artifact?.annotationUrls ?? [],
    imageUrl,
    useText,
    hasImage,
  };
}

export async function extractSinglePage(input: {
  importId: string;
  fileKey: string;
  pageNumber: number;
  autoEnrich: boolean;
  visionForLowConfidenceOnly: boolean;
}): Promise<{ extractedLeadId: string | null; skipped?: boolean }> {
  const { importId, fileKey, pageNumber, autoEnrich, visionForLowConfidenceOnly } =
    input;

  if (await isImportTerminated(importId)) {
    return { extractedLeadId: null, skipped: true };
  }

  const pageData = await loadPageData(importId, fileKey, pageNumber);
  const { text: usableText, annotationUrls, imageUrl, useText, hasImage } =
    pageData;

  if (await isImportTerminated(importId)) {
    return { extractedLeadId: null, skipped: true };
  }

  let draft: BusinessCardDraft;
  if (!useText) {
    draft = {
      name: null,
      title: null,
      company: null,
      emails: [],
      phones: [],
      websites: annotationUrls.filter((u) => u.startsWith("http")),
      address: null,
      raw_text: usableText,
      confidence: 0.3,
      notes: "Insufficient text layer",
    };
  } else {
    try {
      draft = await structureCardFromText(usableText, annotationUrls);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      draft = {
        name: null,
        title: null,
        company: null,
        emails: [],
        phones: [],
        websites: annotationUrls.filter((u) => u.startsWith("http")),
        address: null,
        raw_text: usableText,
        confidence: 0.2,
        notes: `AI structure failed: ${message}`,
      };
    }
  }

  const visionAvailable = hasImage && imageUrl !== null;
  const needsVision =
    visionAvailable &&
    (!visionForLowConfidenceOnly ||
      !useText ||
      (draft.confidence ?? 0) < SKIP_VISION_CONFIDENCE);

  let verified: VerifiedCard | null = null;
  if (needsVision && !(await isImportTerminated(importId))) {
    try {
      verified = await verifyCardAgainstImage(draft, imageUrl!);
    } catch {
      verified = null;
    }
  }

  const fieldFromDraft = (value: string | null) => ({
    value,
    confidence: draft.confidence,
    source: "text_layer" as const,
    unreadable: false,
  });
  const listFromDraft = (values: string[] | undefined) =>
    (values ?? []).map((v) => ({
      value: v,
      confidence: draft.confidence,
      source: "text_layer" as const,
      unreadable: false,
    }));

  const verifiedOrDraft: VerifiedCard = verified ?? {
    name: fieldFromDraft(draft.name),
    title: fieldFromDraft(draft.title),
    company: fieldFromDraft(draft.company),
    emails: listFromDraft(draft.emails),
    phones: listFromDraft(draft.phones),
    websites: listFromDraft(draft.websites),
    address: fieldFromDraft(draft.address),
    overall_confidence: draft.confidence,
    issues: needsVision
      ? [
          {
            field: "_pipeline",
            severity: "warning",
            message: `vision_failed${draft.notes ? `: ${draft.notes}` : ""}`,
          },
        ]
      : [],
  };

  const flat = flattenVerifiedCard(verifiedOrDraft);
  const email = normalizeEmail(flat.email);
  const phone = normalizePhone(flat.phone);
  const website = normalizeWebsite(flat.website);
  const logoUrl = logoFromWebsite(website);

  const fullName = flat.name?.trim() || null;
  const parts = fullName ? fullName.split(/\s+/) : [];
  const firstName = parts.length > 0 ? parts[0] : null;
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;

  let extractionMethod: string;
  if (!useText) extractionMethod = "vision";
  else if (verified) extractionMethod = "text+vision";
  else if (needsVision) extractionMethod = "text_only";
  else extractionMethod = "text";

  if (await isImportTerminated(importId)) {
    return { extractedLeadId: null, skipped: true };
  }

  const [inserted] = await db
    .insert(extractedLeads)
    .values({
      importId,
      pageNumber,
      cardImageUrl: imageUrl,
      rawText: usableText,
      rawJson: verifiedOrDraft,
      name: flat.name,
      displayName: flat.name,
      firstName,
      lastName,
      title: flat.title,
      company: flat.company,
      email,
      phone,
      website,
      address: flat.address,
      logoUrl,
      confidence: String(flat.confidence),
      fieldConfidence: flat.fieldConfidence,
      issues: flat.issues,
      extractionMethod,
      verificationModel: MODEL,
      reviewStatus: "pending",
      enrichmentStatus: "pending",
    })
    .returning({ id: extractedLeads.id });

  await db
    .update(imports)
    .set({ processedItems: sql`${imports.processedItems} + 1` })
    .where(eq(imports.id, importId));

  const [imp] = await db.select().from(imports).where(eq(imports.id, importId));

  if (
    imp &&
    imp.status !== "terminated" &&
    imp.processedItems >= imp.totalItems &&
    imp.totalItems > 0
  ) {
    await db
      .update(imports)
      .set({ status: "ready_for_review" })
      .where(eq(imports.id, importId));
  }

  return { extractedLeadId: inserted.id };
}

export async function getImportEnrichPolicy(importId: string) {
  const [imp] = await db.select().from(imports).where(eq(imports.id, importId));
  if (!imp) return { autoEnrich: true, autoClassify: true, visionForLowConfidenceOnly: true };
  const settings = getImportSettings(imp);
  return {
    autoEnrich: settings.autoEnrich,
    autoClassify: settings.autoClassify,
    visionForLowConfidenceOnly: settings.visionForLowConfidenceOnly,
  };
}
