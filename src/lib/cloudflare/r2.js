import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export function hasR2Config() {
  return Boolean(
    process.env.CLOUDFLARE_ACCOUNT_ID &&
      process.env.CLOUDFLARE_R2_ACCESS_KEY_ID &&
      process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY &&
      process.env.CLOUDFLARE_R2_BUCKET &&
      process.env.CLOUDFLARE_R2_PUBLIC_URL,
  );
}

export function getPublicObjectUrl(key) {
  const publicBaseUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL;

  if (!publicBaseUrl) {
    return null;
  }

  return `${publicBaseUrl.replace(/\/$/, '')}/${key}`;
}

export async function createUploadUrl({ key, contentType }) {
  if (!hasR2Config()) {
    throw new Error('Cloudflare R2 environment variables are missing.');
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    },
  });

  const command = new PutObjectCommand({
    Bucket: process.env.CLOUDFLARE_R2_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(client, command, { expiresIn: 300 });
}

export async function uploadObject({ key, contentType, body }) {
  if (!hasR2Config()) {
    throw new Error('Cloudflare R2 environment variables are missing.');
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    },
  });

  await client.send(
    new PutObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );

  return {
    key,
    publicUrl: getPublicObjectUrl(key),
  };
}
