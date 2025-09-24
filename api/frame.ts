// Removed legacy frame proxy (R2/S3). Return 410 so old clients stop retrying.
export default function handler(_req:any,res:any){
  res.status(410).json({ disabled:true, reason:'frame proxy removed' });
}
