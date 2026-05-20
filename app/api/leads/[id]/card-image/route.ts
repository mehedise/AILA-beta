import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { extractedLeads, leads } from "@/lib/db/schema";
import { getPageImageSignedUrl } from "@/lib/pdf/page-artifacts";
import { getSignedReadUrl } from "@/lib/storage/r2";

/**
 * Returns a fresh signed URL for the lead's originating business-card
 * image (when one exists). We regenerate the URL on every request because
 * the URL persisted at extraction time has a 24h expiry and will be stale
 * on older leads.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, id), eq(leads.userId, userId)));

  if (!lead) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!lead.sourceExtractedLeadId) {
    return NextResponse.json({ url: null });
  }

  const [extracted] = await db
    .select({
      importId: extractedLeads.importId,
      pageNumber: extractedLeads.pageNumber,
      cardImageUrl: extractedLeads.cardImageUrl,
    })
    .from(extractedLeads)
    .where(eq(extractedLeads.id, lead.sourceExtractedLeadId));

  if (!extracted) {
    return NextResponse.json({ url: null });
  }

  // Prefer a freshly signed URL built from the deterministic R2 key.
  if (extracted.importId && extracted.pageNumber) {
    try {
      const url = await getPageImageSignedUrl(
        extracted.importId,
        extracted.pageNumber
      );
      return NextResponse.json({
        url,
        pageNumber: extracted.pageNumber,
      });
    } catch {
      // Object might not exist (text-rich page with hasImage=false).
      // Fall through to the stored URL below.
    }
  }

  // Fall back to the stored URL. If it looks like an R2 key (no scheme),
  // sign it; otherwise return as-is.
  const stored = extracted.cardImageUrl?.trim();
  if (!stored) {
    return NextResponse.json({ url: null });
  }

  if (/^https?:\/\//i.test(stored)) {
    return NextResponse.json({
      url: stored,
      pageNumber: extracted.pageNumber ?? null,
    });
  }

  try {
    const signed = await getSignedReadUrl(stored);
    return NextResponse.json({
      url: signed,
      pageNumber: extracted.pageNumber ?? null,
    });
  } catch {
    return NextResponse.json({ url: null });
  }
}
