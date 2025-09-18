import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { Frame } from '../App';
import { User, Calendar, ArrowBigUp, ArrowBigDown } from 'lucide-react';

interface FrameGalleryProps {
  frames: Frame[];
  pendingFrame?: { imageData: string; startedAt: number } | null;
  initialVotes?: Record<string, { up: number; down: number; my: -1|0|1 }>;
}

export const FrameGallery: React.FC<FrameGalleryProps> = ({ frames, pendingFrame, initialVotes }) => {
  const [openWeeks, setOpenWeeks] = useState<Record<number, boolean>>({});
  const [votes, setVotes] = useState<Record<string, { up: number; down: number; my: -1|0|1 }>>({});
  const toggleWeek = useCallback((week:number)=>{
    setOpenWeeks(o=>({...o,[week]:!o[week]}));
  },[]);
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Initialize votes from prop or fetch once for richer data
  useEffect(()=>{
    if (initialVotes) {
      setVotes({ ...initialVotes });
      return;
    }
    // Best-effort fetch to seed votes for existing frames
    (async ()=>{
      try {
        const r = await fetch('/api/list-frames');
        if (!r.ok) return;
        const j = await r.json();
        const acc: Record<string, { up:number; down:number; my:-1|0|1 }> = {};
        for (const f of (j.frames||[])) {
          const k = f.key || f.id; if (!k) continue;
          if (typeof f.votesUp === 'number' || typeof f.votesDown === 'number' || typeof f.myVote === 'number') {
            acc[k] = { up: f.votesUp||0, down: f.votesDown||0, my: (f.myVote ?? 0) as (-1|0|1) };
          }
        }
        if (Object.keys(acc).length) setVotes(acc);
      } catch {}
    })();
  }, [initialVotes]);

  const vote = useCallback(async (key:string, dir: -1|0|1)=>{
    try {
      const res = await fetch(`/api/frame-vote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, dir }) });
      if (!res.ok) return;
      const j = await res.json();
      // If server flagged it, optimistically drop its votes (it will disappear on next poll in App)
      setVotes(v => ({ ...v, [key]: { up: j.votesUp ?? 0, down: j.votesDown ?? 0, my: (j.myVote ?? 0) as (-1|0|1) } }));
    } catch {}
  }, []);

  // Dedupe: if pending frame image matches the last published frame image, suppress it
  let showPending = false;
  if (pendingFrame) {
    if (frames.length === 0) showPending = true; else {
      const lastImg = frames[frames.length - 1].imageData.split('?')[0];
      const pendingImg = pendingFrame.imageData.split('?')[0];
      showPending = lastImg !== pendingImg;
    }
  }

  if (frames.length === 0 && !showPending) {
    return (
      <div className="text-center py-16">
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-12 border border-white/20 max-w-md mx-auto">
          <h3 className="text-2xl font-bold text-white mb-4">No frames yet</h3>
          <p className="text-white/70 mb-6">Start drawing to create your first frame and contribute to the collaborative video.</p>
          <div className="w-24 h-24 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full mx-auto opacity-20" />
        </div>
      </div>
    );
  }

  // Group frames by paletteWeek
  const grouped = useMemo(()=>{
    const map = new Map<number, Frame[]>();
    for(const f of frames){
      const arr = map.get(f.paletteWeek) || [];
      arr.push(f);
      map.set(f.paletteWeek, arr);
    }
    return Array.from(map.entries()).sort((a,b)=>a[0]-b[0]);
  },[frames]);

  return (
      <div className="space-y-10">
        <div className="text-center">
          <h2 className="text-4xl font-bold text-white mb-2">Frame Gallery</h2>
          <p className="text-white/70 text-sm sm:text-base">
            {frames.length} frames published{showPending ? ' • 1 in progress' : ''}
          </p>
        </div>

  {showPending && pendingFrame && (
          <div className="max-w-[1580px] mx-auto px-2">
              <div className="mb-4">
              <h3 className="text-white/80 text-sm font-semibold mb-1 tracking-wide uppercase">Pending</h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 gap-3">
                <div
                  className="relative bg-white/10 backdrop-blur-sm rounded-2xl overflow-hidden border border-yellow-400/40 hover:bg-white/20 transition-all duration-300"
                >
                  <div className="relative aspect-[480/640] bg-black/40 flex items-center justify-center">
                    <img
                      src={pendingFrame.imageData}
                      alt="Pending frame"
                      className="w-full h-full object-contain opacity-90"
                      loading="lazy"
                    />
                    <div className="absolute top-2 left-2 bg-yellow-500/80 text-black text-xs font-bold px-2 py-1 rounded">
                      In progress
                    </div>
                  </div>
                  <div className="p-2">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-white font-semibold text-[10px]">(day)</span>
                      <span className="text-white/60 text-[10px]">Not published</span>
                    </div>
                    <div className="flex items-center space-x-1.5 text-white/70 text-[10px]">
                      <Calendar className="w-3 h-3" />
                      <span>{formatDate(pendingFrame.startedAt)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

  {/* Week meta helpers (palette/theme/brushes). Keep in sync with App weekly palettes. */}
  {grouped.map(([week, list])=>{
          const sorted = [...list].sort((a,b)=>a.timestamp-b.timestamp);
          const weeklyPalettes: string[][] = [
            ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'],
            ['#E17055', '#FDCB6E', '#6C5CE7', '#A29BFE', '#FD79A8', '#E84393'],
            ['#00CEC9', '#55A3FF', '#FDCB6E', '#E17055', '#A29BFE', '#FD79A8']
          ];
          const themes = ['Anime Inking', 'Retro Comic', 'Soft Watercolor'];
          const palette = weeklyPalettes[week % weeklyPalettes.length] || weeklyPalettes[0];
          const theme = themes[week % themes.length] || themes[0];
          const selectedBrush = 'Ink'; // Week 1 used brush we have
          return (
            <div key={week} className="space-y-1 max-w-[1580px] mx-auto px-2">
              <button
                type="button"
                onClick={()=>toggleWeek(week)}
                className="w-full group flex items-center justify-between rounded-lg px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-left transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <div className={`w-5 h-5 rounded-sm flex items-center justify-center text-[10px] font-bold tracking-wide ${openWeeks[week] ? 'bg-green-500/70 text-black':'bg-white/15 text-white/70'} transition-colors`}>
                    {openWeeks[week] ? '-' : '+'}
                  </div>
                  <h3 className="text-white/90 font-semibold text-sm tracking-wide uppercase">Week {week}</h3>
                  <div className="hidden sm:flex items-center gap-2 ml-2">
                    <div className="flex items-center gap-1">
                      {palette.slice(0,6).map((c, i)=> (
                        <span key={i} className="w-3 h-3 rounded-sm border border-white/30" style={{ backgroundColor: c }} />
                      ))}
                    </div>
                    <span className="text-white/60 text-[10px]">Theme: {theme} • Brush: {selectedBrush}</span>
                  </div>
                </div>
                <span className="text-white/40 text-[10px]">{sorted.length} frames</span>
              </button>
              {openWeeks[week] && (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 gap-3 pt-1">
                  {[...sorted].reverse().map((frame)=>{
                    const index = frames.indexOf(frame); // global index
                    const key = (frame as any).key || frame.id;
                    return (
                      <div
                        key={key}
                        className="bg-white/10 backdrop-blur-sm rounded-xl overflow-hidden border border-white/10 hover:bg-white/20 transition-colors duration-200"
                      >
                        <div className="relative aspect-[480/640] bg-black/40 flex items-center justify-center">
                          <img src={frame.imageData} alt={`Frame ${index+1}`} className="w-full h-full object-contain" loading="lazy" />
                        </div>
                        <div className="p-2">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-white font-semibold text-[10px]">#{index+1}</span>
                            <span className="text-white/50 text-[9px]">{new Date(frame.timestamp).toLocaleTimeString()}</span>
                          </div>
                          <div className="flex items-center space-x-1.5 text-white/70 text-[9px] mb-0.5">
                            <User className="w-3 h-3" />
                            <span className="truncate max-w-[70px]">{frame.artist}</span>
                          </div>
                          <div className="flex items-center space-x-1.5 text-white/60 text-[8px]">
                            <Calendar className="w-3 h-3" />
                            <span>{formatDate(frame.timestamp)}</span>
                          </div>
                          {key && (
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