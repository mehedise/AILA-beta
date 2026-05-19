import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function getClient() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

function getBucket() {
  return process.env.R2_BUCKET ?? "aila";
}

export async function putObjectFromBuffer(
  key: string,
  buf: Buffer,
  contentType: string
): Promise<string> {
  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: buf,
      ContentType: contentType,
    })
  );
  return key;
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const client = getClient();
  const res = await client.send(
    new GetObjectCommand({ Bucket: getBucket(), Key: key })
  );
  const bytes = await res.Body?.transformToByteArray();
  if (!bytes) throw new Error(`Empty object: ${key}`);
  return Buffer.from(bytes);
}

export async function getSignedReadUrl(
  key: string,
  expiresIn = 3600
): Promise<string> {
  const client = getClient();
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: getBucket(), Key: key }),
    { expiresIn }
  );
}

export async function deleteObject(key: string): Promise<void> {
  if (!key) return;
  const client = getClient();
  await client.send(
    new DeleteObjectCommand({ Bucket: getBucket(), Key: key })
  );
}

export function getPublicUrl(key: string): string {
  const base = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (base) return `${base}/${key}`;
  return key;
}
