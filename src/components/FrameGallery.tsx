import React from 'react';
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

  if (frames.length === 0 && !pendingFrame) {
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

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-4xl font-bold text-white mb-4">Frame Gallery</h2>
        <p className="text-white/70 text-lg">
          {frames.length} frames published{pendingFrame ? ' • 1 in progress' : ''}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {pendingFrame && (
          <div
            className="relative bg-white/10 backdrop-blur-sm rounded-2xl overflow-hidden border border-yellow-400/40 hover:bg-white/20 transition-all duration-300"
          >
            <div className="aspect-square relative">
              <img
                src={pendingFrame.imageData}
                alt="Pending frame"
                className="w-full h-full object-cover opacity-90"
              />
              <div className="absolute top-2 left-2 bg-yellow-500/80 text-black text-xs font-bold px-2 py-1 rounded">
                En progreso
              </div>
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white font-bold">(día)</span>
                <span className="text-white/60 text-sm">No publicado</span>
              </div>
              <div className="flex items-center space-x-2 text-white/70 text-sm">
                <Calendar className="w-3 h-3" />
                <span>{formatDate(pendingFrame.startedAt)}</span>
              </div>
            </div>
          </div>
        )}
        {frames.map((frame, index) => (
          <div
            key={frame.id}
            className="bg-white/10 backdrop-blur-sm rounded-2xl overflow-hidden border border-white/20 hover:bg-white/20 transition-all duration-300 transform hover:scale-105"
          >
            <div className="aspect-square">
              <img
                src={frame.imageData}
                alt={`Frame ${index + 1}`}
                className="w-full h-full object-cover"
              />
            </div>
            
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white font-bold">#{index + 1}</span>
                <span className="text-white/60 text-sm">Week {frame.paletteWeek}</span>
              </div>
              
              <div className="flex items-center space-x-2 text-white/70 text-sm mb-2">
                <User className="w-3 h-3" />
                <span>{frame.artist}</span>
              </div>
              
              <div className="flex items-center space-x-2 text-white/70 text-sm">
                <Calendar className="w-3 h-3" />
                <span>{formatDate(frame.timestamp)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};