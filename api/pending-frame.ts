// Removed legacy pending-frame endpoint.
export default function handler(_req:any,res:any){
  res.status(410).json({ disabled:true, pending:null, reason:'pending-frame removed' });
}
