import React from 'react';
import { brushKits, BrushStyle } from '../brushes';
import { ChevronLeft, ChevronRight, MoveUp, MoveDown, Save, Trash2, Undo2, Pencil, Eraser, PaintBucket, Palette as PaletteIcon, Image, Play, Vote, MessageCircle } from 'lucide-react';

export type PanelKey = 'navigation' | 'actions' | 'tools' | 'brushSize' | 'brushMode' | 'palette';

interface SidePanelsProps {
  side: 'left' | 'right';
  toggleSide: () => void;
  order: PanelKey[];
  setOrder: (o: PanelKey[]) => void;
  // navigation
  currentView: 'draw' | 'gallery' | 'video' | 'voting' | 'chat';
  setCurrentView: (v: 'draw' | 'gallery' | 'video' | 'voting' | 'chat') => void;
  // drawing related
  tool: 'draw' | 'erase' | 'fill';
  setTool: (t: 'draw' | 'erase' | 'fill') => void;
  brushSize: number;
  setBrushSize: (n: number) => void;
  setBrushMode: (m: 'solid' | 'soft' | 'fade' | 'spray') => void;
  brushStyle: BrushStyle;
  setBrushStyle: (s: BrushStyle) => void;
  brushPresetId: string;
  setBrushPresetId: (id: string) => void;
  colors: string[];
  activeColor: string;
  setActiveColor: (c: string) => void;
  currentWeek: number;
  onSave: () => void;
  onClear: () => void;
  onUndo?: () => void;
  disabled?: boolean;
}

const PanelWrapper: React.FC<{
  title: string;
  side: 'left' | 'right';
  onToggleSide: () => void;
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
  children: React.ReactNode;
}> = ({ title, side, onToggleSide, canUp, canDown, onUp, onDown, children }) => (
  <div className="bg-white/12 backdrop-blur-xl border border-white/20 rounded-xl shadow-md overflow-hidden flex flex-col">
    <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-white/10">
      <span className="text-white/90 text-[10px] font-semibold tracking-wide flex items-center gap-1">{title}</span>
      <div className="flex items-center gap-0.5">
        <button onClick={onUp} disabled={!canUp} className="p-1 rounded-md bg-white/10 hover:bg-white/25 disabled:opacity-30 text-white" aria-label="Mover arriba">
          <MoveUp className="w-3 h-3" />
        </button>
        <button onClick={onDown} disabled={!canDown} className="p-1 rounded-md bg-white/10 hover:bg-white/25 disabled:opacity-30 text-white" aria-label="Mover abajo">
          <MoveDown className="w-3 h-3" />
        </button>
        <button onClick={onToggleSide} className="p-1 rounded-md bg-white/10 hover:bg-white/25 text-white" aria-label="Cambiar lado" title="Cambiar lado">
          {side === 'right' ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
    <div className="p-2.5 flex flex-col gap-2.5">{children}</div>
  </div>
);

export const SidePanels: React.FC<SidePanelsProps> = ({
  side,
  toggleSide,
  order,
  setOrder,
  currentView,
  setCurrentView,
  tool,
  setTool,
  brushSize,
  setBrushSize,
  setBrushMode,
  brushStyle,
  setBrushStyle,
  brushPresetId,
  setBrushPresetId,
  colors,
  activeColor,
  setActiveColor,
  currentWeek,
  onSave,
  onClear,
  onUndo,
  disabled,
}) => {
  const move = (key: PanelKey, dir: -1 | 1) => {
    const idx = order.indexOf(key);
    const target = idx + dir;
    if (target < 0 || target >= order.length) return;
    const newOrder = [...order];
    const [k] = newOrder.splice(idx, 1);
    newOrder.splice(target, 0, k);
    setOrder(newOrder);
  };

  const renderPanel = (key: PanelKey, idx: number) => {
    const common = {
      side,
      onToggleSide: toggleSide,
      canUp: idx > 0,
      canDown: idx < order.length - 1,
      onUp: () => move(key, -1 as const),
      onDown: () => move(key, 1 as const),
    };

    if (key === 'navigation') {
      return (
        <PanelWrapper key={key} title="Navigation" {...common}>
          <div className="flex flex-wrap gap-2 justify-center">
            {[
              { k: 'draw', label: 'Draw', icon: PaletteIcon },
              { k: 'gallery', label: 'Gallery', icon: Image },
              { k: 'video', label: 'Video', icon: Play },
              { k: 'voting', label: 'Vote', icon: Vote },
              { k: 'chat', label: 'Chat', icon: MessageCircle },
            ].map(({ k, label, icon: Icon }) => (
              <button
                key={k}
                onClick={() => setCurrentView(k as any)}
                className={`px-2 py-1 rounded-md border text-[11px] flex items-center gap-1 transition ${currentView === (k as any) ? 'bg-white/30 border-white/60 text-white' : 'bg-white/10 border-white/20 text-white/80 hover:bg-white/20'}`}
                aria-label={label}
                title={label}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        </PanelWrapper>
      );
    }

    if (key === 'actions') {
      return (
        <PanelWrapper key={key} title="Actions" {...common}>
          <div className="flex items-center justify-center gap-4">
            <button onClick={() => !disabled && onSave()} disabled={disabled} aria-label="Save Frame" className="p-3 rounded-full bg-emerald-500/70 hover:bg-emerald-500 text-white disabled:opacity-40 transition">
              <Save className="w-5 h-5" />
            </button>
            <button onClick={() => !disabled && onUndo?.()} disabled={disabled} aria-label="Undo" title="Undo" className="p-3 rounded-full bg-indigo-500/70 hover:bg-indigo-500 text-white disabled:opacity-40 transition">
              <Undo2 className="w-5 h-5" />
            </button>
            <button onClick={() => !disabled && onClear()} disabled={disabled} aria-label="Clear Canvas" className="p-3 rounded-full bg-red-500/70 hover:bg-red-500 text-white disabled:opacity-40 transition">
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </PanelWrapper>
      );
    }
    if (key === 'tools') {
      return (
        <PanelWrapper key={key} title="Tools" {...common}>
          <div className="flex flex-wrap gap-2 justify-center">
            {['draw', 'erase', 'fill'].map((t) => (
              <button
                key={t}
                onClick={() => setTool(t as any)}
                disabled={disabled}
                aria-label={t}
                title={t}
                className={`p-1.5 rounded-full border transition flex items-center justify-center ${
                  tool === t ? 'bg-white/30 border-white/60 text-white' : 'bg-white/10 border-white/20 text-white/70 hover:bg-white/20'
                } disabled:opacity-40`}
              >
                {t === 'draw' && <Pencil className="w-4 h-4" />}
                {t === 'erase' && <Eraser className="w-4 h-4" />}
                {t === 'fill' && <PaintBucket className="w-4 h-4" />}
              </button>
            ))}
          </div>
        </PanelWrapper>
      );
    }
    if (key === 'brushSize') {
      return (
    <PanelWrapper key={key} title="Brush Size" {...common}>
          <div className="flex items-center justify-center gap-2">
      <button onClick={() => !disabled && setBrushSize(Math.max(1, brushSize - 2))} disabled={disabled} className="px-1.5 py-0.5 text-[11px] rounded-md bg-white/15 hover:bg-white/30 text-white disabled:opacity-40">
              -
            </button>
            <span className="text-white font-mono text-xs w-8 text-center select-none">{brushSize}</span>
            <button onClick={() => !disabled && setBrushSize(Math.min(50, brushSize + 2))} disabled={disabled} className="px-1.5 py-0.5 text-[11px] rounded-md bg-white/15 hover:bg-white/30 text-white disabled:opacity-40">
              +
            </button>
          </div>
          <div className="flex justify-center py-1">
            <div className="rounded-full border border-white/50 shadow-sm" style={{ width: `${Math.max(8, Math.min(34, brushSize))}px`, height: `${Math.max(8, Math.min(34, brushSize))}px`, backgroundColor: activeColor, transition: 'width .15s ease, height .15s ease' }} />
          </div>
          <input type="range" min={1} max={50} value={brushSize} disabled={disabled} onChange={(e) => setBrushSize(Number(e.target.value))} className="w-full h-1 accent-white/80 cursor-pointer" />
        </PanelWrapper>
      );
    }
    if (key === 'brushMode') {
      return (
        <PanelWrapper key={key} title="Brushes" {...common}>
          <div className="flex items-center justify-center gap-1.5 mb-2">
            {(['anime', 'comic', 'watercolor', 'graffiti'] as BrushStyle[]).map((s) => (
              <button
                key={s}
                onClick={() => setBrushStyle(s)}
                disabled={disabled}
                className={`px-2 py-0.5 rounded-full text-[10px] border transition ${s === brushStyle ? 'bg-white/30 text-white border-white/60' : 'bg-white/10 text-white/70 border-white/20 hover:bg-white/20'}`}
                title={s}
              >
                {s[0].toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 justify-center">
            {brushKits[brushStyle].length === 0 ? (
              <div className="text-white/70 text-[11px] italic py-1">No brushes yet</div>
            ) : (
              brushKits[brushStyle].map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setBrushPresetId(p.id);
                    setBrushMode(p.engine);
                    setBrushSize(p.size);
                  }}
                  disabled={disabled}
                  className={`px-2 py-1 rounded-md border text-[11px] transition ${p.id === brushPresetId ? 'bg-white/30 border-white/60 text-white' : 'bg-white/10 border-white/20 text-white/80 hover:bg-white/20'}`}
                  title={`${p.name} · ${p.engine}`}
                >
                  {p.name}
                </button>
              ))
            )}
          </div>
        </PanelWrapper>
      );
    }
    return (
      <PanelWrapper key={key} title={`Palette W${currentWeek}`} {...common}>
        <div className="grid grid-cols-3 gap-2 justify-items-center">
          {colors.map((color) => {
            const active = activeColor === color;
            return (
              <button
                key={color}
                onClick={() => setActiveColor(color)}
                className={`w-8 h-8 rounded-full relative transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-white/70 shadow-sm hover:scale-110 ${active ? 'ring-4 ring-white/70 scale-110' : 'ring-2 ring-white/10'}`}
                style={{ backgroundColor: color }}
                title={color}
              >
                {active && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="w-2 h-2 bg-white rounded-full mix-blend-overlay" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </PanelWrapper>
    );
  };

  return <div className={`w-44 shrink-0 flex flex-col gap-3 ${side === 'right' ? '' : ''}`}>{order.map((k, idx) => renderPanel(k, idx))}</div>;
};
