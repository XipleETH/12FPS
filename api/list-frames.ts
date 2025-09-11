// @ts-nocheck
export default async function handler(req:any,res:any){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS') return res.status(204).end();
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});

  const requiredEnv = ['R2_ENDPOINT','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET'] as const;
  for(const k of requiredEnv){
    if(!process.env[k]){ console.error('[api/list-frames] missing env', k); return res.status(200).json({ frames: [] }); }
  }

  const endpoint = process.env.R2_ENDPOINT!; // https://<account>.r2.cloudflarestorage.com
  const bucket = process.env.R2_BUCKET!;
  const region = process.env.R2_REGION || 'auto';
  const accessKeyId = process.env.R2_ACCESS_KEY_ID!;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY!;
  const publicBase = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/,'');

  try {
    // Dynamic import so dev bundler for client doesn't eagerly include it
    const { S3Client, ListObjectsV2Command } = await import('@aws-sdk/client-s3');
    const client = new S3Client({
      region,
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey }
    });
    const prefix = 'frames/';
    console.log('[api/list-frames] listing via SDK', { bucket, prefix });
    const cmd = new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 100 });
    const out = await client.send(cmd);
    const frames = (out.Contents || [])
      .filter(o => o.Key && o.Key.endsWith('.png'))
      .map(o => {
        const key = o.Key!;
        const lastModified = o.LastModified ? new Date(o.LastModified).getTime() : Date.now();
        const url = publicBase ? `${publicBase}/${key}` : `${endpoint.replace(/\/$/,'')}/${bucket}/${key}`;
        return { key, url, lastModified };
      })
      .sort((a,b)=>a.lastModified-b.lastModified);
    console.log('[api/list-frames] return frames', frames.length);
    return res.status(200).json({ frames });
  } catch(e:any){
    console.error('[api/list-frames] list error', e?.message || e);
    return res.status(200).json({ frames: [] });
  }
}
