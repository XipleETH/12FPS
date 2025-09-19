import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const requiredEnv = ['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'] as const;

function checkEnv() {
  for (const k of requiredEnv) {
    if (!process.env[k]) throw new Error(`Missing env var: ${k}`);
  }
}

function makeClient() {
  const endpoint = process.env.R2_ENDPOINT!; // e.g., https://<accountid>.r2.cloudflarestorage.com
  const region = process.env.R2_REGION || 'auto';
  const accessKeyId = process.env.R2_ACCESS_KEY_ID!;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY!;
  return new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey }
  });
}

function cors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req: any, res: any) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    checkEnv();
  } catch (e: any) {
  console.error('[api/upload-url] env check failed', e?.message);
    return res.status(500).json({ error: e.message });
  }

  try {
  const { contentType = 'image/png', ext = 'png', prefix = 'frames' } = (req.body || {});
    const bucket = process.env.R2_BUCKET!;
    const publicBase = process.env.R2_PUBLIC_BASE_URL; // e.g., https://cdn.example.com

    const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    const key = `${prefix}/${id}.${ext}`;

    const client = makeClient();
    const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
    const signedUrl = await getSignedUrl(client, cmd, { expiresIn: 900 });

    const publicUrl = publicBase ? `${publicBase.replace(/\/$/, '')}/${key}` : undefined;
  console.log('[api/upload-url] generated signed URL', { key, bucket, hasPublicBase: !!publicBase });
  return res.status(200).json({ signedUrl, key, publicUrl, bucket });
  } catch (err: any) {
  console.error('[api/upload-url] error creating signed URL', err);
    return res.status(500).json({ error: 'Failed to create signed URL' });
  }
}
