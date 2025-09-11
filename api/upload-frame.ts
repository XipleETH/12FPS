// @ts-nocheck
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

function cors(res:any){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
}

export default async function handler(req:any,res:any){
  cors(res);
  if(req.method==='OPTIONS') return res.status(204).end();
  if(req.method!=='POST') return res.status(405).json({ error:'Method not allowed' });

  const need = ['R2_ENDPOINT','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET'];
  const miss = need.filter(k=>!process.env[k]);
  if(miss.length){
    return res.status(500).json({ error:'Missing env vars', missing: miss });
  }

  const { dataUrl, prefix='frames' } = req.body || {};
  if(typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) {
    return res.status(400).json({ error:'Invalid dataUrl' });
  }

  try {
    const base64 = dataUrl.split(',')[1];
    const buffer = Buffer.from(base64,'base64');
    const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8);
    const key = `${prefix}/${id}.png`;

    const client = new S3Client({
      region: process.env.R2_REGION || 'auto',
      endpoint: process.env.R2_ENDPOINT!,
      forcePathStyle: true,
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! }
    });

    await client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: key,
      Body: buffer,
      ContentType: 'image/png',
      CacheControl: 'public, max-age=31536000, immutable'
    }));

    const publicBase = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/,'');
    const url = publicBase ? `${publicBase}/${key}` : `${process.env.R2_ENDPOINT!.replace(/\/$/,'')}/${process.env.R2_BUCKET!}/${key}`;
    console.log('[api/upload-frame] stored', { key, size: buffer.length });
    return res.status(200).json({ ok:true, key, url });
  } catch(e:any){
    console.error('[api/upload-frame] error', e?.message || e);
    return res.status(500).json({ error:'Upload failed' });
  }
}
