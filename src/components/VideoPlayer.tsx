import React, { useState, useEffect, useRef } from 'react';
import { Frame } from '../App';
import { Play, Pause, SkipBack, SkipForward, Download } from 'lucide-react';

interface VideoPlayerProps {
  frames: Frame[];
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ frames }) => {
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(12); // 12 FPS default
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (isPlaying && frames.length > 0) {
      intervalRef.current = window.setInterval(() => {
        setCurrentFrameIndex(prev => (prev + 1) % frames.length);
      }, 1000 / playbackSpeed);
    } else {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
    }

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, playbackSpeed, frames.length]);

  const togglePlayback = () => {
    if (frames.length === 0) return;
    setIsPlaying(!isPlaying);
  };

  const nextFrame = () => {
    if (frames.length === 0) return;
    setCurrentFrameIndex(prev => (prev + 1) % frames.length);
  };

  const prevFrame = () => {
    if (frames.length === 0) return;
    setCurrentFrameIndex(prev => (prev - 1 + frames.length) % frames.length);
  };

  if (frames.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-12 border border-white/20 max-w-md mx-auto">
          <h3 className="text-2xl font-bold text-white mb-4">No Video Yet</h3>
          <p className="text-white/70 mb-6">
            Create frames to build the collaborative video! Each drawing becomes a frame in our community animation.
          </p>
          <div className="w-24 h-24 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full mx-auto opacity-20" />
        </div>
      </div>
    );
  }

  // Determine top two frames (most recent). Assuming chronological order ascending; adjust if needed.
  const topTwo = frames.slice(-2).reverse(); // latest first
  const rest = frames.slice(0, Math.max(0, frames.length - 2));

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-4xl font-bold text-white mb-4">Collaborative Video</h2>
        <p className="text-white/70 text-lg">
          {frames.length} frames • {playbackSpeed} FPS • Community Creation
        </p>
      </div>

      <div className="max-w-7xl mx-auto space-y-10">
        {/* Top two large videos */}
        <div className="grid gap-8 md:grid-cols-2">
          {topTwo.map((f, i) => (
            <div key={f.id} className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/20 flex flex-col">
              <div className="relative aspect-[540/740] bg-black/40 rounded-xl border-2 border-white/20 flex items-center justify-center overflow-hidden mb-4">
                <img src={f.imageData} alt={`Top Frame ${frames.indexOf(f)+1}`} className="max-w-full max-h-full object-contain rounded-md" />
                <div className="absolute top-2 left-2 bg-blue-600/80 text-white text-xs font-semibold px-2 py-1 rounded">
                  #{frames.indexOf(f)+1}
                </div>
              </div>
              <div className="flex-1 flex flex-col items-center text-center mb-4">
                <p className="text-white font-semibold">Frame {frames.indexOf(f)+1} / {frames.length}</p>
                <p className="text-white/70 text-sm">By {f.artist} • Week {f.paletteWeek}</p>
              </div>
              {i === 0 && (
                <div className="flex flex-col items-center gap-4">
                  <div className="flex items-center space-x-4">
                    <button onClick={prevFrame} className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><SkipBack className="w-5 h-5 text-white" /></button>
                    <button onClick={togglePlayback} className="p-4 bg-blue-500 hover:bg-blue-600 rounded-full transition-colors">{isPlaying ? <Pause className="w-6 h-6 text-white" /> : <Play className="w-6 h-6 text-white" />}</button>
                    <button onClick={nextFrame} className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><SkipForward className="w-5 h-5 text-white" /></button>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="text-white/70 text-sm">Speed:</span>
                    {[6,12,24].map(fps => (
                      <button key={fps} onClick={() => setPlaybackSpeed(fps)} className={`px-3 py-1 rounded-lg text-sm transition-colors ${playbackSpeed===fps ? 'bg-blue-500 text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}>{fps}</button>
                    ))}
                  </div>
                  <div className="w-full bg-white/20 rounded-full h-2">
                    <div className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-100" style={{ width: `${((currentFrameIndex + 1) / frames.length) * 100}%` }} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        {/* Rest grid */}
        {rest.length > 0 && (
          <div>
            <h3 className="text-white/80 font-semibold mb-4 text-sm tracking-wide">All Frames</h3>
            <div className="grid gap-6 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
              {rest.map((f) => (
                <div key={f.id} className="bg-white/5 hover:bg-white/10 transition-colors rounded-xl p-2 border border-white/15 flex flex-col">
                  <div className="relative aspect-[540/740] bg-black/40 rounded-lg overflow-hidden mb-2 flex items-center justify-center">
                    <img src={f.imageData} alt={`Frame thumb ${frames.indexOf(f)+1}`} className="object-contain w-full h-full" />
                    <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                      #{frames.indexOf(f)+1}
                    </div>
                  </div>
                  <span className="text-white/70 text-[10px] truncate">{f.artist}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Export */}
        <div className="text-center pt-4">
          <button className="flex items-center space-x-2 bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg mx-auto transition-colors">
            <Download className="w-5 h-5" />
            <span>Export Video</span>
          </button>
        </div>
      </div>
    </div>
  );
};