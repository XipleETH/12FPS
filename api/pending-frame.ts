// @ts-nocheck
import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

function cors(res:any){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
}

function getEnv(){
  const need = ['R2_ENDPOINT','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET'];
  const miss = need.filter(k=>!process.env[k]);
  if(miss.length) throw new Error('Missing env vars: '+miss.join(','));
  return {
    endpoint: process.env.R2_ENDPOINT!,
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    bucket: process.env.R2_BUCKET!,
    region: process.env.R2_REGION || 'auto',
    publicBase: process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/,'')
  };
}

function clientFrom(env:any){
  return new S3Client({
    region: env.region,
    endpoint: env.endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: env.accessKeyId, secretAccessKey: env.secretAccessKey }
  });
}

function keyForUser(user?:string){
  if(!user) return 'pending/latest.png';
  const safe = user.replace(/[^a-zA-Z0-9_\-:.]/g,'_');
  return `pending/${safe}.png`;
}

export default async function handler(req:any,res:any){
  cors(res);
  if(req.method==='OPTIONS') return res.status(204).end();
  try {
    const env = getEnv();
    const client = clientFrom(env);

    if(req.method==='GET'){
      const user = (req.query && (req.query.user||req.query.u)) || undefined;
      const KEY = keyForUser(user as string|undefined);
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket: env.bucket, Key: KEY }));
        const lm = head.LastModified ? new Date(head.LastModified).getTime() : null;
        const etag = head.ETag ? head.ETag.replace(/"/g,'') : undefined;
        if(!lm){
          return res.status(200).json({ pending: null });
        }
        const url = env.publicBase ? `${env.publicBase}/${KEY}` : `/api/frame?key=${encodeURIComponent(KEY)}`;
        return res.status(200).json({ pending: { key: KEY, url, lastModified: lm, etag } });
      } catch(e){
        return res.status(200).json({ pending: null });
      }
    }

    if(req.method==='POST'){
      const { dataUrl, user } = req.body || {};
      const KEY = keyForUser(user);
      if(typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')){
        return res.status(400).json({ error:'Invalid dataUrl'});
      }
      const base64 = dataUrl.split(',')[1];
      const buffer = Buffer.from(base64,'base64');
      await client.send(new PutObjectCommand({
        Bucket: env.bucket,
        Key: KEY,
        Body: buffer,
        ContentType: 'image/png',
        CacheControl: 'no-store, max-age=0'
      }));
      const url = env.publicBase ? `${env.publicBase}/${KEY}` : `/api/frame?key=${encodeURIComponent(KEY)}`;
      // Get head after upload for fresh metadata
      let lm:number|undefined; let etag:string|undefined;
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket: env.bucket, Key: KEY }));
        lm = head.LastModified ? new Date(head.LastModified).getTime() : undefined;
        etag = head.ETag ? head.ETag.replace(/"/g,'') : undefined;
      } catch {}
      return res.status(200).json({ ok:true, key: KEY, url, lastModified: lm, etag });
    }

    if(req.method==='DELETE'){
      const user = (req.query && (req.query.user||req.query.u)) || undefined;
      const KEY = keyForUser(user as string|undefined);
      try { await client.send(new DeleteObjectCommand({ Bucket: env.bucket, Key: KEY })); } catch {}
      return res.status(200).json({ ok:true, deleted: KEY });
    }

    return res.status(405).json({ error:'Method not allowed' });
  } catch(e:any){
    return res.status(200).json({ pending: null, error: e?.message || String(e) });
  }
}
