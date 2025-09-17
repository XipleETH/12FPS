import React, { useMemo } from 'react';
import type { Frame } from '../RootApp';
import { User, Calendar } from 'lucide-react';

interface FrameGalleryProps { frames: Frame[]; }
export const FrameGallery: React.FC<FrameGalleryProps> = ({ frames }) => {
  const formatDate = (timestamp: number) => new Date(timestamp).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
  if (frames.length === 0) return (
    <div className="text-center py-12">
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20 max-w-md mx-auto">
        <h3 className="text-xl font-bold text-white mb-3">No Frames Yet</h3>
        <p className="text-white/70 mb-4 text-sm">Start drawing to create your first frame and contribute!</p>
        <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full mx-auto opacity-20" />
      </div>
    </div>
  );

  // group by week
  const grouped = useMemo(()=>{
    const m = new Map<number, Frame[]>();
    for(const f of frames){
      const arr = m.get(f.paletteWeek) || [];
      arr.push(f);
      m.set(f.paletteWeek, arr);
    }
    return Array.from(m.entries()).sort((a,b)=>a[0]-b[0]);
  },[frames]);

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-white mb-1">Frame Gallery</h2>
        <p className="text-white/60 text-xs">{frames.length} frames publicados</p>
      </div>
      {grouped.map(([week, list])=>{
        const sorted = [...list].sort((a,b)=>a.timestamp-b.timestamp);
        return (
          <div key={week} className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-white/90 font-semibold text-sm tracking-wide uppercase">Semana {week}</h3>
              <span className="text-white/40 text-[10px]">{sorted.length} frames</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 gap-3">
              {[...sorted].reverse().map((frame)=>{
                const index = frames.indexOf(frame);
                return (
                  <div key={frame.id} className="bg-white/10 backdrop-blur-sm rounded-xl overflow-hidden border border-white/10 hover:bg-white/20 transition-colors duration-200">
                    <div className="relative aspect-[540/740] bg-black/40 flex items-center justify-center">
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
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
