// Removed legacy list-frames (R2/S3). Use /api/list-frames served by Devvit server.
export default function handler(_req:any,res:any){
  res.status(410).json({ disabled:true, frames:[], reason:'list-frames removed' });
}
