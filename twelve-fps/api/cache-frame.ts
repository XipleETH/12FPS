import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const requiredEnv = ['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'] as const;

function ensureEnv() {
  for (const k of requiredEnv) if (!process.env[k]) throw new Error(`Missing env var: ${k}`);
}

function makeClient() {
  return new S3Client({
    region: process.env.R2_REGION || 'auto',
    endpoint: process.env.R2_ENDPOINT!,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!
    }
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

  try { ensureEnv(); } catch (e: any) { console.error('[api/cache-frame] env error', e?.message); return res.status(500).json({ error: e.message }); }

  const { dataUrl } = req.body || {};
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) {
    console.error('[api/cache-frame] invalid dataUrl');
    return res.status(400).json({ error: 'Invalid dataUrl' });
  }

  try {
    // Daily key (UTC)
    const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const key = `cache/${day}.png`;

    const base64 = dataUrl.split(',')[1];
    const buffer = Buffer.from(base64, 'base64');

    const client = makeClient();
  console.log('[api/cache-frame] putting object', { key });
  await client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: key,
      Body: buffer,
      ContentType: 'image/png',
      CacheControl: 'no-store, max-age=0'
    }));

    const publicBase = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, '');
    const url = publicBase ? `${publicBase}/${key}` : `${process.env.R2_ENDPOINT!.replace(/\/$/, '')}/${process.env.R2_BUCKET!}/${key}`;

  console.log('[api/cache-frame] success', { key });
  return res.status(200).json({ ok: true, key, url });
  } catch (err: any) {
  console.error('[api/cache-frame] error', err);
    return res.status(500).json({ error: 'Upload failed' });
  }
}
