import React, { useState, useEffect, useRef } from 'react';
import type { Frame } from '../RootApp';
import { Play, Pause, SkipBack, SkipForward, Download } from 'lucide-react';

interface VideoPlayerProps { frames: Frame[]; }
export const VideoPlayer: React.FC<VideoPlayerProps> = ({ frames }) => {
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(12);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (isPlaying && frames.length > 0) {
      intervalRef.current = setInterval(() => setCurrentFrameIndex(p => (p + 1) % frames.length), 1000 / playbackSpeed);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isPlaying, playbackSpeed, frames.length]);
  const togglePlayback = () => { if (frames.length === 0) return; setIsPlaying(s => !s); };
  const nextFrame = () => { if (!frames.length) return; setCurrentFrameIndex(p => (p + 1) % frames.length); };
  const prevFrame = () => { if (!frames.length) return; setCurrentFrameIndex(p => (p - 1 + frames.length) % frames.length); };
  if (frames.length === 0) return (
    <div className="text-center py-16"><div className="bg-white/10 backdrop-blur-sm rounded-2xl p-12 border border-white/20 max-w-md mx-auto"><h3 className="text-2xl font-bold text-white mb-4">No Video Yet</h3><p className="text-white/70 mb-6">Create frames to build the collaborative video! Each drawing becomes a frame in our community animation.</p><div className="w-24 h-24 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full mx-auto opacity-20" /></div></div>
  );
  // frames.length > 0 here, so currentFrameIndex in range
  const currentFrame = frames[currentFrameIndex]!;
  return (
    <div className="space-y-8">
      <div className="text-center"><h2 className="text-4xl font-bold text-white mb-4">Collaborative Video</h2><p className="text-white/70 text-lg">{frames.length} frames • {playbackSpeed} FPS • Community Creation</p></div>
      <div className="max-w-4xl mx-auto">
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
          <div className="aspect-square max-w-lg mx-auto mb-6"><img src={currentFrame.imageData} alt={`Frame ${currentFrameIndex + 1}`} className="w-full h-full object-cover rounded-xl border-2 border-white/20" /></div>
          <div className="text-center mb-6"><p className="text-white text-lg font-semibold">Frame {currentFrameIndex + 1} of {frames.length}</p><p className="text-white/70">Created by {currentFrame.artist} • Week {currentFrame.paletteWeek}</p></div>
          <div className="flex items-center justify-center space-x-4 mb-6">
            <button onClick={prevFrame} className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><SkipBack className="w-5 h-5 text-white" /></button>
            <button onClick={togglePlayback} className="p-4 bg-blue-500 hover:bg-blue-600 rounded-full transition-colors">{isPlaying ? <Pause className="w-6 h-6 text-white" /> : <Play className="w-6 h-6 text-white" />}</button>
            <button onClick={nextFrame} className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><SkipForward className="w-5 h-5 text-white" /></button>
          </div>
          <div className="flex items-center justify-center space-x-4 mb-6"><span className="text-white/70">Speed:</span>{[6,12,24].map(fps => <button key={fps} onClick={() => setPlaybackSpeed(fps)} className={`px-3 py-1 rounded-lg transition-colors ${playbackSpeed === fps ? 'bg-blue-500 text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}>{fps} FPS</button>)}</div>
          <div className="w-full bg-white/20 rounded-full h-2 mb-4"><div className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-100" style={{ width: `${((currentFrameIndex + 1) / frames.length) * 100}%` }} /></div>
          <div className="text-center"><button className="flex items-center space-x-2 bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg mx-auto transition-colors"><Download className="w-5 h-5" /><span>Export Video</span></button></div>
        </div>
      </div>
    </div>
  );
};
