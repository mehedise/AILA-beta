import {
  getObjectBuffer,
  getSignedReadUrl,
  objectExists,
  putObjectFromBuffer,
} from "@/lib/storage/r2";

/**
 * Small JSON sidecar written for every prerendered PDF page. We keep text
 * here so `extract-page` can run the structuring AI call without ever
 * re-downloading or re-parsing the source PDF.
 */
export type PageArtifact = {
  text: string;
  annotationUrls: string[];
  /**
   * True when a per-page image was rendered to R2 alongside this JSON.
   * Lets extract-page decide whether vision verification is possible.
   */
  hasImage: boolean;
};

export function pageJsonKey(importId: string, pageNumber: number): string {
  return `imports/${importId}/pages/${pageNumber}.json`;
}

export function pageArtifactsPrefix(importId: string): string {
  return `imports/${importId}/pages/`;
}

export function pageImageKey(importId: string, pageNumber: number): string {
  return `imports/${importId}/pages/${pageNumber}.jpg`;
}

function legacyPageImageKey(importId: string, pageNumber: number): string {
  return `imports/${importId}/pages/${pageNumber}.png`;
}

export async function writePageArtifact(
  importId: string,
  pageNumber: number,
  artifact: PageArtifact
): Promise<void> {
  await putObjectFromBuffer(
    pageJsonKey(importId, pageNumber),
    Buffer.from(JSON.stringify(artifact)),
    "application/json"
  );
}

export async function readPageArtifact(
  importId: string,
  pageNumber: number
): Promise<PageArtifact | null> {
  try {
    const buf = await getObjectBuffer(pageJsonKey(importId, pageNumber));
    return JSON.parse(buf.toString("utf-8")) as PageArtifact;
  } catch {
    return null;
  }
}

export async function writePageImage(
  importId: string,
  pageNumber: number,
  image: Buffer
): Promise<string> {
  const key = pageImageKey(importId, pageNumber);
  await putObjectFromBuffer(key, image, "image/jpeg");
  return key;
}

export async function getPageImageSignedUrl(
  importId: string,
  pageNumber: number,
  expiresIn = 86400
): Promise<string> {
  const key = pageImageKey(importId, pageNumber);
  if (await objectExists(key)) {
    return getSignedReadUrl(key, expiresIn);
  }
  return getSignedReadUrl(legacyPageImageKey(importId, pageNumber), expiresIn);
}
