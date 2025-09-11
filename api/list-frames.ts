export default async function handler(req:any,res:any){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS') return res.status(204).end();
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  const { R2_ENDPOINT, R2_BUCKET, R2_PUBLIC_BASE_URL } = process.env;
  if(!R2_ENDPOINT || !R2_BUCKET){
    return res.status(200).json({ frames: [] });
  }
  try {
    const listUrl = `${R2_ENDPOINT.replace(/\/$/,'')}/${R2_BUCKET}?list-type=2&prefix=frames/`;
    console.log('[api/list-frames] fetching', listUrl);
    const resp = await fetch(listUrl);
    if(!resp.ok){
      console.error('[api/list-frames] non-ok status', resp.status);
      return res.status(200).json({ frames: [] });
    }
    const xml = await resp.text();
    console.log('[api/list-frames] xml length', xml.length);
    const regex = /<Contents>\s*<Key>(.*?)<\/Key>[\s\S]*?<LastModified>(.*?)<\/LastModified>/g;
    const frames:any[] = [];
    let m:RegExpExecArray|null;
    while((m = regex.exec(xml))){
      const key = m[1];
      if(!key.endsWith('.png')) continue;
      const lastModified = Date.parse(m[2]) || Date.now();
      const url = R2_PUBLIC_BASE_URL ? `${R2_PUBLIC_BASE_URL.replace(/\/$/,'')}/${key}` : `${R2_ENDPOINT.replace(/\/$/,'')}/${R2_BUCKET}/${key}`;
      frames.push({ key, url, lastModified });
    }
    frames.sort((a,b)=>a.lastModified-b.lastModified);
    console.log('[api/list-frames] returning frames', frames.length);
    res.status(200).json({ frames });
  } catch(e){
    console.error('[api/list-frames] error', e);
    res.status(200).json({ frames: [] });
  }
}
