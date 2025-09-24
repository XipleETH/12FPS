// Removed presigned URL generator. Redis-only architecture.
export default function handler(_req:any,res:any){
  res.status(410).json({ disabled:true, reason:'upload-url removed' });
}
