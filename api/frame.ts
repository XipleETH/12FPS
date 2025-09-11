// @ts-nocheck
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

function cors(res:any){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
}

export default async function handler(req:any,res:any){
  cors(res);
  if(req.method==='OPTIONS') return res.status(204).end();
  if(req.method!=='GET') return res.status(405).json({ error:'Method not allowed' });
  const key = (req.query?.key || req.query?.k || '').toString();
  if(!key || (!key.startsWith('frames/') && !key.startsWith('cache/'))){
    return res.status(400).json({ error:'Invalid key' });
  }
  const need = ['R2_ENDPOINT','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET'];
  const missing = need.filter(k=>!process.env[k]);
  if(missing.length){
    return res.status(500).json({ error:'Server misconfigured' });
  }
  try {
    const client = new S3Client({
      region: process.env.R2_REGION || 'auto',
      endpoint: process.env.R2_ENDPOINT!,
      forcePathStyle: true,
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! }
    });
    const out = await client.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: key }));
    const body = await out.Body?.transformToByteArray();
    if(!body){
      return res.status(404).json({ error:'Not found' });
    }
    res.setHeader('Content-Type', out.ContentType || 'image/png');
    res.setHeader('Cache-Control','public, max-age=60');
    res.status(200).end(Buffer.from(body));
  } catch(e:any){
    console.error('[api/frame] error', e?.message || e);
    return res.status(500).json({ error:'Fetch failed' });
  }
}
