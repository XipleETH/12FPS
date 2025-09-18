import React, { useMemo, useState, useCallback, useEffect } from 'react';
import type { Frame } from '../RootApp';
import { User, Calendar, ArrowBigUp, ArrowBigDown } from 'lucide-react';

interface FrameGalleryProps { frames: Frame[]; initialVotes?: Record<string, { up:number; down:number; my:-1|0|1 }>; }
export const FrameGallery: React.FC<FrameGalleryProps> = ({ frames, initialVotes }) => {
  const [openWeeks, setOpenWeeks] = useState<Record<number, boolean>>({});
  const [votes, setVotes] = useState<Record<string, { up: number; down: number; my: -1|0|1 }>>({});
  const [isMod, setIsMod] = useState(false);
  const [modFrames, setModFrames] = useState<any[]>([]);
  const toggleWeek = useCallback((week:number)=>{
    setOpenWeeks(o=>({...o,[week]:!o[week]}));
  },[]);
  const formatDate = (timestamp: number) => new Date(timestamp).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});

  // Seed votes from incoming frames/initialVotes
  useEffect(()=>{
    if (initialVotes) setVotes({ ...initialVotes });
    else {
      const acc: Record<string, { up:number; down:number; my:-1|0|1 }> = {};
      for (const f of frames as any[]) {
        const id = (f as any).key || (f as any).id;
        if (!id) continue;
        if ((f as any).votesUp != null || (f as any).votesDown != null || (f as any).myVote != null) {
          acc[id] = { up: (f as any).votesUp||0, down: (f as any).votesDown||0, my: (f as any).myVote ?? 0 };
        }
      }
      if (Object.keys(acc).length) setVotes(acc);
    }
  }, [frames, initialVotes]);

  // Mod panel loader
  useEffect(()=>{ (async ()=>{
    try {
      const me = await fetch('/api/mod/me');
      if (me.ok) {
        const j = await me.json();
        if (j.isMod) {
          setIsMod(true);
          const r = await fetch('/api/mod/frames');
          if (r.ok) {
            const mj = await r.json();
            setModFrames(mj.frames||[]);
          }
        } else setIsMod(false);
      }
    } catch {}
  })(); },[]);

  const restoreFrame = useCallback(async (key:string)=>{
    try { const r = await fetch(`/api/mod/frames/${encodeURIComponent(key)}/restore`, { method:'POST' }); if (r.ok){ setModFrames(m=>m.filter(x=>x.key!==key)); } } catch {}
  },[]);
  const deleteFrame = useCallback(async (key:string)=>{
    try { const r = await fetch(`/api/mod/frames/${encodeURIComponent(key)}`, { method:'DELETE' }); if (r.ok){ setModFrames(m=>m.filter(x=>x.key!==key)); } } catch {}
  },[]);

  const vote = useCallback(async (key: string, dir: -1|0|1)=>{
    try {
      const res = await fetch(`/api/frame-vote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, dir }) });
      if (!res.ok) return;
      const j = await res.json();
      setVotes(v => ({ ...v, [key]: { up: j.votesUp, down: j.votesDown, my: j.myVote } }));
    } catch {}
  }, []);
  if (frames.length === 0) return (
    <div className="text-center py-12">
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20 max-w-md mx-auto">
        <h3 className="text-xl font-bold text-white mb-3">No Frames Yet</h3>
        <p className="text-white/70 mb-4 text-sm">Start drawing to create your first frame and contribute!</p>
        <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full mx-auto opacity-20" />
      </div>
    </div>
  );

  // group by week (support both local and server frames)
  const grouped = useMemo(()=>{
    const m = new Map<number, Frame[]>();
    for(const f of frames){
      const week = (f as any).paletteWeek ?? (f as any).week ?? 0;
      const arr = m.get(week) || [];
      arr.push(f);
      m.set(week, arr);
    }
    return Array.from(m.entries()).sort((a,b)=>a[0]-b[0]);
  },[frames]);

  return (
    <div className="space-y-8">
      {isMod && (
        <div className="bg-amber-500/10 border border-amber-400/30 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-amber-200 text-sm font-semibold">Moderation Queue</h3>
            <span className="text-amber-200/70 text-xs">{modFrames.length} flagged</span>
          </div>
          {modFrames.length===0 ? (
            <div className="text-amber-200/70 text-xs">Queue is empty.</div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {modFrames.map(mf=>{
                return (
                  <div key={mf.key} className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
                    <div className="aspect-[480/640] bg-black/40">
                      <img src={mf.url} alt={mf.key} className="w-full h-full object-contain" />
                    </div>
                    <div className="p-2">
                      <div className="flex items-center justify-between text-[10px] text-white/70">
                        <span className="truncate max-w-[80px]">{mf.artist}</span>
                        <span>{(mf.votesUp||0) - (mf.votesDown||0)}</span>
                      </div>
                      <div className="mt-1 flex gap-2">
                        <button onClick={()=>restoreFrame(mf.key)} className="flex-1 text-emerald-300 hover:text-emerald-200 text-[10px]">Restore</button>
                        <button onClick={()=>deleteFrame(mf.key)} className="flex-1 text-red-300 hover:text-red-200 text-[10px]">Delete</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      <div className="text-center">
        <h2 className="text-3xl font-bold text-white mb-1">Frame Gallery</h2>
        <p className="text-white/60 text-xs">{frames.length} frames publicados</p>
      </div>
      {grouped.map(([week, list])=>{
        const sorted = [...list].sort((a,b)=>a.timestamp-b.timestamp);
        return (
          <div key={week} className="space-y-1">
            <button
              type="button"
              onClick={()=>toggleWeek(week)}
              className="w-full group flex items-center justify-between rounded-md px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-left transition-colors"
            >
              <div className="flex items-center space-x-3">
                <div className={`w-5 h-5 rounded-sm flex items-center justify-center text-[10px] font-bold tracking-wide ${openWeeks[week] ? 'bg-green-500/70 text-black':'bg-white/15 text-white/70'} transition-colors`}>
                  {openWeeks[week] ? '-' : '+'}
                </div>
                <h3 className="text-white/90 font-semibold text-sm tracking-wide uppercase">Semana {week}</h3>
              </div>
              <span className="text-white/40 text-[10px]">{sorted.length} frames</span>
            </button>
            {openWeeks[week] && (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 gap-3 pt-1">
                {[...sorted].reverse().map((frame)=>{
                  const index = frames.indexOf(frame);
                  const imgSrc = (frame as any).imageData || (frame as any).url;
                  const ts = (frame as any).timestamp ?? (frame as any).lastModified;
                  const artist = (frame as any).artist ?? 'anonymous';
                  const key = (frame as any).key || (frame as any).id;
                  const canVote = typeof key === 'string' && key.includes('/');
                  return (
                    <div key={key} className="bg-white/10 backdrop-blur-sm rounded-xl overflow-hidden border border-white/10 hover:bg-white/20 transition-colors duration-200">
                      <div className="relative aspect-[480/640] bg-black/40 flex items-center justify-center">
                        <img src={imgSrc} alt={`Frame ${index+1}`} className="w-full h-full object-contain" loading="lazy" />
                      </div>
                      <div className="p-2">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-white font-semibold text-[10px]">#{index+1}</span>
                          <span className="text-white/50 text-[9px]">{new Date(ts).toLocaleTimeString()}</span>
                        </div>
                        <div className="flex items-center space-x-1.5 text-white/70 text-[9px] mb-0.5">
                          <User className="w-3 h-3" />
                          <span className="truncate max-w-[70px]">{artist}</span>
                        </div>
                        <div className="flex items-center space-x-1.5 text-white/60 text-[8px]">
                          <Calendar className="w-3 h-3" />
                          <span>{formatDate(ts)}</span>
                        </div>
                        {canVote && (
                          <div className="mt-1 flex items-center justify-end gap-2">
                            <button aria-label="Upvote" onClick={()=>vote(key, votes[key]?.my===1 ? 0 : 1)} className={`p-0.5 rounded ${votes[key]?.my===1? 'text-green-400':'text-white/50'} hover:text-green-300`}>
                              <ArrowBigUp className="w-4 h-4" />
                            </button>
                            <span className="text-[9px] text-white/60">{(votes[key]?.up ?? 0) - (votes[key]?.down ?? 0)}</span>
                            <button aria-label="Downvote" onClick={()=>vote(key, votes[key]?.my===-1 ? 0 : -1)} className={`p-0.5 rounded ${votes[key]?.my===-1? 'text-red-400':'text-white/50'} hover:text-red-300`}>
                              <ArrowBigDown className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
