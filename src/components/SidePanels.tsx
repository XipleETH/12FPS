import React from 'react';
import { ChevronLeft, ChevronRight, MoveUp, MoveDown, Save, Trash2, Brush, Droplet, Wind, Sparkles } from 'lucide-react';

export type PanelKey = 'actions' | 'brushSize' | 'brushMode' | 'palette';

interface SidePanelsProps {
  side: 'left' | 'right';
  toggleSide: () => void;
  order: PanelKey[];
  setOrder: (o: PanelKey[]) => void;
  // drawing related
  brushSize: number;
  setBrushSize: (n: number) => void;
  brushMode: 'solid' | 'soft' | 'fade' | 'spray';
  setBrushMode: (m: 'solid' | 'soft' | 'fade' | 'spray') => void;
  colors: string[];
  activeColor: string;
  setActiveColor: (c: string) => void;
  currentWeek: number;
  onSave: () => void;
  onClear: () => void;
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
}> = ({ title, side, onToggleSide, canUp, canDown, onUp, onDown, children }) => {
  return (
    <div className="bg-white/12 backdrop-blur-xl border border-white/20 rounded-xl shadow-md overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-white/10">
        <span className="text-white/90 text-[10px] font-semibold tracking-wide flex items-center gap-1">{title}</span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={onUp}
            disabled={!canUp}
            className="p-1 rounded-md bg-white/10 hover:bg-white/25 disabled:opacity-30 text-white"
            aria-label="Mover arriba"
          >
            <MoveUp className="w-3 h-3" />
          </button>
          <button
            onClick={onDown}
            disabled={!canDown}
            className="p-1 rounded-md bg-white/10 hover:bg-white/25 disabled:opacity-30 text-white"
            aria-label="Mover abajo"
          >
            <MoveDown className="w-3 h-3" />
          </button>
          <button
            onClick={onToggleSide}
            className="p-1 rounded-md bg-white/10 hover:bg-white/25 text-white"
            aria-label="Cambiar lado"
            title="Cambiar lado"
          >
            {side === 'right' ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
      <div className="p-2.5 flex flex-col gap-2.5">
        {children}
      </div>
    </div>
  );
};

export const SidePanels: React.FC<SidePanelsProps> = ({
  side,
  toggleSide,
  order,
  setOrder,
  brushSize,
  setBrushSize,
  brushMode,
  setBrushMode,
  colors,
  activeColor,
  setActiveColor,
  currentWeek,
  onSave,
  onClear,
  disabled
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
      onDown: () => move(key, 1 as const)
    };

    if (key === 'actions') {
      return (
        <PanelWrapper key={key} title="Actions" {...common}>
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => !disabled && onSave()}
              disabled={disabled}
              aria-label="Save Frame"
              className="p-3 rounded-full bg-emerald-500/70 hover:bg-emerald-500 text-white disabled:opacity-40 transition"
            >
              <Save className="w-5 h-5" />
            </button>
            <button
              onClick={() => !disabled && onClear()}
              disabled={disabled}
              aria-label="Clear Canvas"
              className="p-3 rounded-full bg-red-500/70 hover:bg-red-500 text-white disabled:opacity-40 transition"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </PanelWrapper>
      );
    }
    if (key === 'brushSize') {
      return (
        <PanelWrapper key={key} title="Brush Size" {...common}>
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => !disabled && setBrushSize(Math.max(1, brushSize - 2))}
              disabled={disabled}
              className="px-1.5 py-0.5 text-[11px] rounded-md bg-white/15 hover:bg-white/30 text-white disabled:opacity-40"
            >-</button>
            <span className="text-white font-mono text-xs w-8 text-center select-none">{brushSize}</span>
            <button
              onClick={() => !disabled && setBrushSize(Math.min(50, brushSize + 2))}
              disabled={disabled}
              className="px-1.5 py-0.5 text-[11px] rounded-md bg-white/15 hover:bg-white/30 text-white disabled:opacity-40"
            >+</button>
          </div>
          <div className="flex justify-center py-1">
            <div
              className="rounded-full border border-white/50 shadow-sm"
              style={{
                width: `${Math.max(8, Math.min(34, brushSize))}px`,
                height: `${Math.max(8, Math.min(34, brushSize))}px`,
                backgroundColor: activeColor,
                transition: 'width .15s ease, height .15s ease'
              }}
            />
          </div>
          <input
            type="range"
            min={1}
            max={50}
            value={brushSize}
            disabled={disabled}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="w-full h-1 accent-white/80 cursor-pointer"
          />
        </PanelWrapper>
      );
    }
    if (key === 'brushMode') {
      return (
        <PanelWrapper key={key} title="Brush Mode" {...common}>
      <div className="flex flex-wrap gap-2 justify-center">
            {[
              { key: 'solid', icon: <Brush className="w-4 h-4" />, label: 'Solid' },
              { key: 'soft', icon: <Droplet className="w-4 h-4" />, label: 'Soft' },
              { key: 'fade', icon: <Wind className="w-4 h-4" />, label: 'Fade' },
              { key: 'spray', icon: <Sparkles className="w-4 h-4" />, label: 'Spray' }
            ].map(m => (
              <button
                key={m.key}
                onClick={() => setBrushMode(m.key as any)}
                disabled={disabled}
                aria-label={m.label}
                title={m.label}
        className={`p-1.5 rounded-full border transition flex items-center justify-center ${
                  brushMode === m.key
                    ? 'bg-white/30 border-white/60 text-white'
                    : 'bg-white/10 border-white/20 text-white/70 hover:bg-white/20'
                } disabled:opacity-40`}
              >
                {m.icon}
              </button>
            ))}
          </div>
        </PanelWrapper>
      );
    }
    // palette
    return (
      <PanelWrapper key={key} title={`Palette W${currentWeek}`} {...common}>
  <div className="grid grid-cols-3 gap-2 justify-items-center">
          {colors.map(color => {
            const active = activeColor === color;
            return (
              <button
                key={color}
                onClick={() => setActiveColor(color)}
    className={`w-8 h-8 rounded-full relative transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-white/70 shadow-sm hover:scale-110 ${
      active ? 'ring-4 ring-white/70 scale-110' : 'ring-2 ring-white/10'
                }`}
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

  return (
    <div className={`w-44 shrink-0 flex flex-col gap-3 ${side === 'right' ? '' : ''}`}>
      {order.map((k, idx) => renderPanel(k, idx))}
    </div>
  );
};
