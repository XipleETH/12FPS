// Removed legacy endpoint (previously R2/S3 cache-frame). Kept as no-op to avoid 404s on stale clients.
export default function handler(_req:any,res:any){
  res.status(410).json({ disabled:true, reason:'cache-frame removed' });
}
