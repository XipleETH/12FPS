import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

const requiredEnv = ['R2_ENDPOINT','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET'] as const;
function ensure() { for (const k of requiredEnv) if (!process.env[k]) throw new Error(`Missing env var: ${k}`); }
function client() { return new S3Client({ region: process.env.R2_REGION || 'auto', endpoint: process.env.R2_ENDPOINT!, forcePathStyle: true, credentials:{ accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! } }); }
function cors(res:any){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');}

export default async function handler(req:any,res:any){
  cors(res);
  if(req.method==='OPTIONS') return res.status(204).end();
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  try { ensure(); } catch(e:any){ return res.status(500).json({error:e.message}); }
  try {
    const c = client();
    const bucket = process.env.R2_BUCKET!;
    const cmd = new ListObjectsV2Command({ Bucket: bucket, Prefix: 'frames/' });
    const out = await c.send(cmd);
    const publicBase = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/,'');
    const frames = (out.Contents||[])
      .filter(obj=> obj.Key && obj.Key.endsWith('.png'))
      .map(obj => {
        const key = obj.Key!;
        const url = publicBase ? `${publicBase}/${key}` : `${process.env.R2_ENDPOINT!.replace(/\/$/,'')}/${bucket}/${key}`;
        return { key, url, lastModified: obj.LastModified ? new Date(obj.LastModified).getTime() : Date.now() };
      });
    return res.status(200).json({ frames });
  } catch(err:any){
    console.error('list-frames error', err);
    return res.status(500).json({ error: 'List failed' });
  }
}
