// Removed healthcheck. Left to avoid 404 noise.
export default function handler(_req:any,res:any){
  res.status(410).json({ disabled:true, reason:'r2 removed' });
}
