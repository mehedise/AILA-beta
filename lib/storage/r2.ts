import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  UploadPartCommand,
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

export async function objectExists(key: string): Promise<boolean> {
  if (!key) return false;
  const client = getClient();
  try {
    await client.send(
      new HeadObjectCommand({ Bucket: getBucket(), Key: key })
    );
    return true;
  } catch {
    return false;
  }
}

export async function deleteObject(key: string): Promise<void> {
  if (!key) return;
  const client = getClient();
  await client.send(
    new DeleteObjectCommand({ Bucket: getBucket(), Key: key })
  );
}

export async function deleteObjectsByPrefix(prefix: string): Promise<number> {
  if (!prefix) return 0;

  const client = getClient();
  const bucket = getBucket();
  let continuationToken: string | undefined;
  let deleted = 0;

  do {
    const listed = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );

    const objects =
      listed.Contents?.map((item) => item.Key)
        .filter((key): key is string => Boolean(key))
        .map((Key) => ({ Key })) ?? [];

    if (objects.length > 0) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: objects,
            Quiet: true,
          },
        })
      );
      deleted += objects.length;
    }

    continuationToken = listed.NextContinuationToken;
  } while (continuationToken);

  return deleted;
}

export function getPublicUrl(key: string): string {
  const base = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (base) return `${base}/${key}`;
  return key;
}

export async function createMultipartUpload(
  key: string,
  contentType: string
): Promise<string> {
  const client = getClient();
  const res = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: getBucket(),
      Key: key,
      ContentType: contentType,
    })
  );
  if (!res.UploadId) throw new Error("Failed to create multipart upload");
  return res.UploadId;
}

export async function signUploadPartUrl(
  key: string,
  uploadId: string,
  partNumber: number,
  expiresIn = 3600
): Promise<string> {
  const client = getClient();
  return getSignedUrl(
    client,
    new UploadPartCommand({
      Bucket: getBucket(),
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    }),
    { expiresIn }
  );
}

export async function uploadMultipartPartFromBuffer(
  key: string,
  uploadId: string,
  partNumber: number,
  body: Buffer
): Promise<string> {
  const client = getClient();
  const res = await client.send(
    new UploadPartCommand({
      Bucket: getBucket(),
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
      Body: body,
    })
  );
  const etag = res.ETag?.replace(/"/g, "");
  if (!etag) {
    throw new Error(`Missing ETag for part ${partNumber}`);
  }
  return etag;
}

export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: Array<{ partNumber: number; etag: string }>
): Promise<void> {
  const client = getClient();
  await client.send(
    new CompleteMultipartUploadCommand({
      Bucket: getBucket(),
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((p) => ({
            ETag: p.etag,
            PartNumber: p.partNumber,
          })),
      },
    })
  );
}

export async function abortMultipartUpload(
  key: string,
  uploadId: string
): Promise<void> {
  const client = getClient();
  await client.send(
    new AbortMultipartUploadCommand({
      Bucket: getBucket(),
      Key: key,
      UploadId: uploadId,
    })
  );
}
