// Removed uploader. Use /api/upload-frame (Redis) inside Devvit environment.
export default function handler(_req:any,res:any){
  res.status(410).json({ disabled:true, reason:'upload-frame removed' });
}
