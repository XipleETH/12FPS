import React, { useMemo } from 'react';
import { Frame } from '../App';
import { User, Calendar } from 'lucide-react';

interface FrameGalleryProps {
  frames: Frame[];
  pendingFrame?: { imageData: string; startedAt: number } | null;
}

export const FrameGallery: React.FC<FrameGalleryProps> = ({ frames, pendingFrame }) => {
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

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
          <h3 className="text-2xl font-bold text-white mb-4">No Frames Yet</h3>
          <p className="text-white/70 mb-6">
            Start drawing to create your first frame and contribute to the collaborative video!
          </p>
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
            {frames.length} frames publicados{showPending ? ' • 1 en progreso' : ''}
          </p>
        </div>

  {showPending && pendingFrame && (
          <div className="max-w-[1580px] mx-auto px-2">
            <div className="mb-6">
              <h3 className="text-white/80 text-lg font-semibold mb-2">Pendiente</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                <div
                  className="relative bg-white/10 backdrop-blur-sm rounded-2xl overflow-hidden border border-yellow-400/40 hover:bg-white/20 transition-all duration-300"
                >
                  <div className="relative aspect-[540/740] bg-black/40 flex items-center justify-center">
                    <img
                      src={pendingFrame.imageData}
                      alt="Pending frame"
                      className="w-full h-full object-contain opacity-90"
                      loading="lazy"
                    />
                    <div className="absolute top-2 left-2 bg-yellow-500/80 text-black text-xs font-bold px-2 py-1 rounded">
                      En progreso
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-white font-bold text-xs">(día)</span>
                      <span className="text-white/60 text-[11px]">No publicado</span>
                    </div>
                    <div className="flex items-center space-x-2 text-white/70 text-[11px]">
                      <Calendar className="w-3 h-3" />
                      <span>{formatDate(pendingFrame.startedAt)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

  {grouped.map(([week, list])=>{
          const sorted = [...list].sort((a,b)=>a.timestamp-b.timestamp);
          return (
            <div key={week} className="space-y-3 max-w-[1580px] mx-auto px-2">
              <div className="flex items-center justify-between">
                <h3 className="text-white/90 font-semibold text-xl">Semana {week}</h3>
                <span className="text-white/40 text-xs">{sorted.length} frames</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                {[...sorted].reverse().map((frame)=>{
                  const index = frames.indexOf(frame); // global index
                  return (
                    <div
                      key={frame.id}
                      className="bg-white/10 backdrop-blur-sm rounded-2xl overflow-hidden border border-white/15 hover:bg-white/20 transition-all duration-300"
                    >
                      <div className="relative aspect-[540/740] bg-black/40 flex items-center justify-center">
                        <img src={frame.imageData} alt={`Frame ${index+1}`} className="w-full h-full object-contain" loading="lazy" />
                      </div>
                      <div className="p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-white font-bold text-xs">#{index+1}</span>
                          <span className="text-white/50 text-[11px]">{new Date(frame.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <div className="flex items-center space-x-2 text-white/70 text-[11px] mb-1">
                          <User className="w-3 h-3" />
                          <span className="truncate max-w-[90px]">{frame.artist}</span>
                        </div>
                        <div className="flex items-center space-x-2 text-white/60 text-[10px]">
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