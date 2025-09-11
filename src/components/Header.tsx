import React from 'react';
import { Palette, Play, Image, Vote, MessageCircle, ChevronRight } from 'lucide-react';

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
    <aside
      className="group/side fixed top-0 left-0 h-screen w-[60px] hover:w-48 transition-all duration-300 flex flex-col bg-white/10 backdrop-blur-xl border-r border-white/20 shadow-xl z-40 overflow-hidden"
    >
      <div className="flex items-center gap-2 px-3 py-4 select-none border-b border-white/10">
        <div className="w-9 h-9 bg-gradient-to-tr from-purple-500 via-fuchsia-500 to-pink-500 rounded-xl flex items-center justify-center shadow-inner flex-shrink-0">
          <Palette className="w-4 h-4 text-white" />
        </div>
        <span className="text-lg font-extrabold tracking-tight bg-gradient-to-tr from-white via-fuchsia-200 to-purple-300 bg-clip-text text-transparent drop-shadow-sm opacity-0 group-hover/side:opacity-100 transition-opacity duration-200">12FPS</span>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-4 flex flex-col gap-2">
        {navigation.map(({ key, label, icon: Icon }) => {
          const active = currentView === key;
          return (
            <button
              key={key}
              onClick={() => setCurrentView(key as any)}
              className={`group/item relative flex items-center rounded-md px-3 py-2 text-sm font-medium border transition outline-none focus:ring-2 focus:ring-white/50 ${active ? 'bg-white/25 border-white/60 text-white shadow-inner' : 'bg-white/10 border-white/20 text-white/70 hover:bg-white/20 hover:text-white'}`}
              aria-label={label}
            >
              <Icon className={`w-5 h-5 ${active ? 'text-white' : 'text-white/70 group-hover:item:text-white'} transition-colors`} />
              <span className="ml-2 whitespace-nowrap opacity-0 group-hover/side:opacity-100 transition-opacity duration-200">{label}</span>
              {/* Tooltip when collapsed (only show if not hovered side) */}
              <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 rounded bg-black/70 text-white text-xs opacity-0 group-hover/side:opacity-0 group-hover/item:opacity-100 transition-opacity duration-200">
                {label}
              </span>
            </button>
          );
        })}
      </nav>
      <div className="px-3 py-3 text-[10px] text-white/40 border-t border-white/10 font-mono tracking-wide flex items-center gap-2">
        <ChevronRight className="w-3 h-3 text-white/30" />
        <span className="opacity-0 group-hover/side:opacity-100 transition-opacity duration-200">session</span>
      </div>
    </aside>
  );
};