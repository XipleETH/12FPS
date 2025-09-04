import React from 'react';
import { Palette, Play, Image, Vote } from 'lucide-react';

interface HeaderProps {
  currentView: 'draw' | 'gallery' | 'video' | 'voting';
  setCurrentView: (view: 'draw' | 'gallery' | 'video' | 'voting') => void;
}

export const Header: React.FC<HeaderProps> = ({ currentView, setCurrentView }) => {
  const navigation = [
    { key: 'draw', label: 'Draw', icon: Palette },
    { key: 'gallery', label: 'Gallery', icon: Image },
    { key: 'video', label: 'Video', icon: Play },
    { key: 'voting', label: 'Vote', icon: Vote }
  ] as const;

  return (
    <header className="bg-black/25 backdrop-blur-md border-b border-white/10">
      <div className="max-w-5xl mx-auto px-3 py-2">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-r from-purple-500 to-pink-500 rounded-md flex items-center justify-center shadow">
              <Palette className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-lg font-semibold tracking-tight text-white whitespace-nowrap">12 Frames Per Second</h1>
          </div>
          <nav className="flex gap-1">
            {navigation.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setCurrentView(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                  currentView === key
                    ? 'bg-white/20 text-white'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
};