// @ts-nocheck
import { S3Client, PutObjectCommand, ListObjectsV2Command, HeadBucketCommand } from '@aws-sdk/client-s3';

function cors(res:any){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
}

export default async function handler(req:any,res:any){
  cors(res);
  if(req.method==='OPTIONS') return res.status(204).end();
  if(req.method!=='GET') return res.status(405).json({ error:'Method not allowed' });
  const needed = ['R2_ENDPOINT','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET'];
  const missing = needed.filter(k=>!process.env[k]);
  if(missing.length){
    return res.status(200).json({ ok:false, stage:'env', missing });
  }
  const endpoint = process.env.R2_ENDPOINT!;
  const bucket = process.env.R2_BUCKET!;
  const region = process.env.R2_REGION || 'auto';
  const client = new S3Client({ region, endpoint, forcePathStyle:true, credentials:{ accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! } });

  const report:any = { ok:true, bucket };
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    report.headBucket = 'ok';
  } catch(e:any){ report.ok=false; report.headBucket = e.message; }

  if(report.ok){
    try {
      const list = await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys:1 }));
      report.list = 'ok';
      report.sampleCount = (list.Contents||[]).length;
    } catch(e:any){ report.ok=false; report.list = e.message; }
  }

  if(report.ok){
    try {
      const key = `health/diag-${Date.now()}.txt`;
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: 'ok', ContentType:'text/plain', CacheControl:'no-store' }));
      report.put = 'ok';
      report.testKey = key;
    } catch(e:any){ report.ok=false; report.put = e.message; }
  }

  return res.status(200).json(report);
}
