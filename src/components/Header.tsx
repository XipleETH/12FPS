import React from 'react';
import { Palette, Play, Image, Vote, MessageCircle } from 'lucide-react';

interface HeaderProps {
  currentView: 'draw' | 'gallery' | 'video' | 'voting' | 'chat';
  setCurrentView: (view: 'draw' | 'gallery' | 'video' | 'voting' | 'chat') => void;
}

export const Header: React.FC<HeaderProps> = ({ currentView, setCurrentView }) => {
  const navigation = [
    { key: 'draw', label: 'Draw', icon: Palette },
    { key: 'gallery', label: 'Gallery', icon: Image },
    { key: 'video', label: 'Video', icon: Play },
    { key: 'voting', label: 'Vote', icon: Vote },
    { key: 'chat', label: 'Chat', icon: MessageCircle }
  ] as const;

  return (
    <header className="w-full mb-4">
      <div className="max-w-6xl mx-auto px-3">
        <div className="flex items-center justify-between bg-white/12 backdrop-blur-xl border border-white/20 rounded-2xl px-4 py-2 shadow-md">
          <div className="flex items-center gap-2 select-none">
            <div className="w-8 h-8 bg-gradient-to-tr from-purple-500 via-fuchsia-500 to-pink-500 rounded-xl flex items-center justify-center shadow-inner">
              <Palette className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-extrabold tracking-tight bg-gradient-to-tr from-white via-fuchsia-200 to-purple-300 bg-clip-text text-transparent drop-shadow-sm">12FPS</span>
          </div>
          <nav className="flex items-center gap-2 overflow-x-auto">
            {navigation.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setCurrentView(key as any)}
                className={`px-3 h-8 rounded-md border text-[12px] font-medium flex items-center gap-1 transition whitespace-nowrap ${currentView===key ? 'bg-white/30 border-white/60 text-white shadow-inner' : 'bg-white/10 border-white/20 text-white/80 hover:bg-white/20'}`}
                aria-label={label}
                title={label}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
};