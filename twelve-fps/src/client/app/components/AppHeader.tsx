import React from 'react';
import { Palette as PaletteIcon, Image, Play, Vote, MessageCircle } from 'lucide-react';

interface AppHeaderProps {
  currentView: 'draw' | 'gallery' | 'video' | 'voting' | 'chat';
  setCurrentView: (v: 'draw' | 'gallery' | 'video' | 'voting' | 'chat') => void;
}

const navItems: Array<{k: AppHeaderProps['currentView']; label: string; icon: React.ComponentType<{className?:string}>}> = [
  { k: 'draw', label: 'Draw', icon: PaletteIcon },
  { k: 'gallery', label: 'Gallery', icon: Image },
  { k: 'video', label: 'Video', icon: Play },
  { k: 'voting', label: 'Vote', icon: Vote },
  { k: 'chat', label: 'Chat', icon: MessageCircle },
];

export const AppHeader: React.FC<AppHeaderProps> = ({ currentView, setCurrentView }) => {
  return (
    <header className="w-full mb-4">
      <div className="flex items-center justify-between bg-white/12 backdrop-blur-xl border border-white/20 rounded-2xl px-4 py-2 shadow-md">
        <div className="flex items-center gap-2 select-none">
          <span className="text-lg font-extrabold tracking-tight bg-gradient-to-tr from-white via-fuchsia-200 to-purple-300 bg-clip-text text-transparent drop-shadow-sm">12FPS</span>
        </div>
        <nav className="flex items-center gap-2">
          {navItems.map(({k,label,icon:Icon}) => (
            <button
              key={k}
              onClick={() => setCurrentView(k)}
              className={`px-3 h-8 rounded-md border text-[12px] font-medium flex items-center gap-1 transition whitespace-nowrap ${currentView===k ? 'bg-white/30 border-white/60 text-white shadow-inner' : 'bg-white/10 border-white/20 text-white/80 hover:bg-white/20'}`}
              aria-label={label}
              title={label}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
};

export default AppHeader;
