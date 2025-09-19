import React from 'react';
import { allBrushPresets, BrushPreset } from '../brushes';
import { ChevronLeft, ChevronRight, MoveUp, MoveDown, Save, Trash2, Undo2, Pencil, Eraser, PaintBucket, Clock } from 'lucide-react';

// Minimal clapperboard icons (open/closed) tailored for start/finalize actions
const ClapperOpen: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M3 11h18v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9Z" />
    <path d="m3 7 2.5 2M7 5l2.5 4M11 5l2.5 4M15 5l2.5 4M19 5l2 4" />
    <path d="M3 7V5a1 1 0 0 1 1-1h3.2a1 1 0 0 1 .8.4L10 7" />
  </svg>
);
const ClapperClosed: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M3 10h18v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10Z" />
    <path d="M3 6h18v4H3z" />
    <path d="m5 6 2.5 4M9 6l2.5 4M13 6l2.5 4M17 6l2 4" />
  </svg>
);

export type PanelKey = 'actions' | 'tools' | 'brushSize' | 'brushMode' | 'palette';

interface SidePanelsProps {
  side: 'left' | 'right';
  toggleSide: () => void;
  order: PanelKey[];
  setOrder: (o: PanelKey[]) => void;
  // navigation
  // drawing related
  tool: 'draw' | 'erase' | 'fill';
  setTool: (t: 'draw' | 'erase' | 'fill') => void;
  brushSize: number;
  setBrushSize: (n: number) => void;
  // (brush-related props removed)
  colors: string[];
  activeColor: string;
  setActiveColor: (c: string) => void;
  currentWeek: number;
  onSave: () => void;
  onClear: () => void;
  onUndo?: () => void;
  disabled?: boolean;
  // session controls
  timeLeft?: number; // seconds until window end
  // Lobby
  // lobbyToggleButton removed
  // Deprecated: lobby & external artist action button removed
  // New turn control callbacks & state
  onStartTurn?: () => void;
  onFinalizeTurn?: () => void;
  canStart?: boolean;
  isArtist?: boolean;
  currentArtist?: string | null;
  // Brush preset control
  brushPresetId?: string;
  setBrushPresetId?: (id: string) => void;
  // Allowed brushes gating (winners)
  allowedBrushIds?: string[];
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
  extraWidth?: number;
}> = ({ title, side, onToggleSide, canUp, canDown, onUp, onDown, children, extraWidth }) => (
  <div className="bg-white/12 backdrop-blur-xl border border-white/20 rounded-xl shadow-md overflow-hidden flex flex-col min-w-0" style={extraWidth ? { width: extraWidth } : undefined}>
    <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
      <span className="text-white/90 text-[10px] font-semibold tracking-wide flex items-center gap-1 leading-none">{title}</span>
      <div className="flex items-center gap-1">
        <button onClick={onUp} disabled={!canUp} className="w-7 h-7 flex items-center justify-center rounded-md bg-white/10 hover:bg-white/25 disabled:opacity-30 text-white" aria-label="Mover arriba">
          <MoveUp className="w-3 h-3" />
        </button>
        <button onClick={onDown} disabled={!canDown} className="w-7 h-7 flex items-center justify-center rounded-md bg-white/10 hover:bg-white/25 disabled:opacity-30 text-white" aria-label="Mover abajo">
          <MoveDown className="w-3 h-3" />
        </button>
        <button onClick={onToggleSide} className="w-7 h-7 flex items-center justify-center rounded-md bg-white/10 hover:bg-white/25 text-white" aria-label="Cambiar lado" title="Cambiar lado">
          {side === 'right' ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
    <div className="p-3 flex flex-col gap-3">{children}</div>
  </div>
);

export const SidePanels: React.FC<SidePanelsProps> = ({
  side,
  toggleSide,
  order,
  setOrder,
  tool,
  setTool,
  brushSize,
  setBrushSize,
  colors,
  activeColor,
  setActiveColor,
  currentWeek,
  onSave,
  onClear,
  onUndo,
  disabled,
  timeLeft,
  onStartTurn,
  onFinalizeTurn,
  canStart,
  isArtist,
  currentArtist,
  brushPresetId,
  setBrushPresetId,
  allowedBrushIds,
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


    if (key === 'actions') {
      return (
  <PanelWrapper key={key} title="Actions" {...common} extraWidth={222}>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-center gap-3 flex-wrap">
              {(canStart || isArtist) && (
                (() => {
                  const turnBtnDisabled = isArtist ? !!disabled : !canStart; // starting allowed even if drawing disabled
                  return (
                    <button
                      onClick={() => {
                        if (turnBtnDisabled) return;
                        if (isArtist && onFinalizeTurn) {
                          onFinalizeTurn();
                        } else if (canStart) {
                          onStartTurn?.();
                        }
                      }}
                      aria-label={isArtist ? 'Finalize Turn' : 'Start Turn'}
                      title={isArtist ? 'Finalize Turn' : 'Start Turn'}
                      className={`w-9 h-9 flex items-center justify-center rounded-full text-white transition focus:outline-none focus:ring-2 focus:ring-white/50 ${
                        turnBtnDisabled
                          ? 'bg-blue-500/30 cursor-not-allowed'
                          : isArtist
                            ? 'bg-black/80 hover:bg-black'
                            : 'bg-blue-600/80 hover:bg-blue-600'
                      }`}
                      disabled={turnBtnDisabled}
                    >
                      {isArtist ? <ClapperClosed className="w-4 h-4" /> : <ClapperOpen className="w-4 h-4" />}
                    </button>
                  );
                })()
              )}
              <button onClick={() => !disabled && onSave()} disabled={disabled} aria-label="Save Frame" className="w-9 h-9 flex items-center justify-center rounded-full bg-emerald-500/70 hover:bg-emerald-500 text-white disabled:opacity-40 transition">
                <Save className="w-4 h-4" />
              </button>
              <button onClick={() => !disabled && onUndo?.()} disabled={disabled} aria-label="Undo" title="Undo" className="w-9 h-9 flex items-center justify-center rounded-full bg-indigo-500/70 hover:bg-indigo-500 text-white disabled:opacity-40 transition">
                <Undo2 className="w-4 h-4" />
              </button>
              <button onClick={() => !disabled && onClear()} disabled={disabled} aria-label="Clear Canvas" className="w-9 h-9 flex items-center justify-center rounded-full bg-red-500/70 hover:bg-red-500 text-white disabled:opacity-40 transition">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            {typeof timeLeft === 'number' && (
              <div className="flex items-center justify-center gap-2 text-white/90 text-[11px] font-mono flex-wrap leading-none">
                <Clock className="w-4 h-4 text-white/80" />
                <span>{new Date(timeLeft * 1000).toISOString().substring(11,19)}</span>
                <span className="text-white/60">|
                  <span className="ml-1 font-semibold text-white/90">{currentArtist ? currentArtist : '—'}</span>
                </span>
              </div>
            )}
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
                className={`w-9 h-9 rounded-full border transition flex items-center justify-center ${
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
            <button onClick={() => !disabled && setBrushSize(Math.max(1, brushSize - 2))} disabled={disabled} className="w-7 h-7 flex items-center justify-center text-[11px] rounded-md bg-white/15 hover:bg-white/30 text-white disabled:opacity-40">-</button>
            <span className="text-white font-mono text-xs w-10 text-center select-none">{brushSize}</span>
            <button onClick={() => !disabled && setBrushSize(Math.min(50, brushSize + 2))} disabled={disabled} className="w-7 h-7 flex items-center justify-center text-[11px] rounded-md bg-white/15 hover:bg-white/30 text-white disabled:opacity-40">+</button>
          </div>
          <div className="flex justify-center py-1">
            <div className="rounded-full border border-white/50 shadow-sm" style={{ width: `${Math.max(8, Math.min(34, brushSize))}px`, height: `${Math.max(8, Math.min(34, brushSize))}px`, backgroundColor: activeColor, transition: 'width .15s ease, height .15s ease' }} />
          </div>
          <input type="range" min={1} max={50} value={brushSize} disabled={disabled} onChange={(e) => setBrushSize(Number(e.target.value))} className="w-full h-1 accent-white/80 cursor-pointer" />
        </PanelWrapper>
      );
    }
    if (key === 'brushMode') {
  // Allowed winners or default four (ink, acrílico, marker, charcoal)
  // Pencil removed; new brushes: acuarela, acrilico, lapicero
  const defaultIds = ['ink','acrilico','marker','charcoal'];
  const ids = (allowedBrushIds && allowedBrushIds.length > 0 ? allowedBrushIds : defaultIds).slice(0,4);
  const presets: BrushPreset[] = allBrushPresets.filter(p => ids.includes(p.id));
      const InkIcon = ({ active }: { active: boolean }) => (
        <svg viewBox="0 0 24 24" className="w-4 h-4" stroke="black" fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: active ? 0.9 : 0.65 }}>
          <path d="M5 19c4-1 7-4 9-8 1-2 2-4 2-6" />
          <path d="M15 5c0 2-1.2 3.2-2.4 4.4C10.8 11.2 9 13 8 16l-.7 2.1" />
          <path d="M4 21h16" />
        </svg>
      );
      const AcrilicoIcon = ({ active }: { active: boolean }) => (
        <svg viewBox="0 0 24 24" className="w-4 h-4" stroke="black" fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: active ? 0.9 : 0.65 }}>
          {/* Stylized flat brush with bristles */}
          <path d="M4 20h16" />
          <path d="M6 14h12l-1.5 4h-9z" />
          <path d="M8 4h8l2 6H6z" />
        </svg>
      );
      const AcuarelaIcon = ({ active }: { active: boolean }) => (
        <svg viewBox="0 0 24 24" className="w-4 h-4" stroke="black" fill="none" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: active ? 0.9 : 0.65 }}>
          {/* Droplet + soft stroke */}
          <path d="M12 3c-2.5 3-4 5.5-4 7.5A4 4 0 0 0 12 15a4 4 0 0 0 4-4.5C16 8.5 14.5 6 12 3Z" />
          <path d="M5 19c4-1.2 10-.8 14 0" />
        </svg>
      );
      const LapiceroIcon = ({ active }: { active: boolean }) => (
        <svg viewBox="0 0 24 24" className="w-4 h-4" stroke="black" fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: active ? 0.9 : 0.65 }}>
          {/* Ballpoint pen silhouette */}
          <path d="M5 16 14.5 6.5a2.2 2.2 0 0 1 3 3L8 19l-4 1 1-4Z" />
          <path d="m14.5 6.5 3 3" />
          <path d="M11 21h2" />
        </svg>
      );
      const MarkerIcon = ({ active }: { active: boolean }) => (
        <svg viewBox="0 0 24 24" className="w-4 h-4" stroke="black" fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: active ? 0.9 : 0.65 }}>
          <path d="M4 20h16" />
          <path d="M7 16 15.5 4.5a2.1 2.1 0 0 1 3 2.9L11 19l-4 1 1-4Z" />
        </svg>
      );
      const CharcoalIcon = ({ active }: { active: boolean }) => (
        <svg viewBox="0 0 24 24" className="w-4 h-4" stroke="black" fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: active ? 0.9 : 0.65 }}>
          <path d="M5 19c2.5-1.2 5-2.4 7.2-5.2 1.8-2.2 2.8-4.4 3.3-6.5" />
          <path d="M9 18c1.2-.6 2.4-1.3 3.5-2.4 2.4-2.3 3.8-5.3 4.3-8.1" />
          <path d="M4 21h16" />
        </svg>
      );
      return (
        <PanelWrapper key={key} title="Brushes" {...common}>
          <div className="grid grid-cols-2 gap-2">
            {presets.map(p => {
              const active = p.id === brushPresetId;
        const Icon = p.id === 'ink'
          ? InkIcon
          : p.id === 'acrilico'
            ? AcrilicoIcon
            : p.id === 'acuarela'
              ? AcuarelaIcon
              : p.id === 'lapicero'
                ? LapiceroIcon
                : p.id === 'marker'
                  ? MarkerIcon
                  : CharcoalIcon;
              return (
                <button
                  key={p.id}
                  disabled={disabled}
                  onClick={() => { setBrushPresetId?.(p.id); setBrushSize(p.size); }}
          className={`flex items-center justify-center px-1.5 py-1 rounded-md hover:bg-white/10 ${active ? 'bg-white/15 border border-white/40' : ''} disabled:opacity-40`}
                  title={p.name}
                >
          <Icon active={active} />
                </button>
              );
            })}
          </div>
        </PanelWrapper>
      );
    }
    return (
      <PanelWrapper key={key} title={`Palette W${currentWeek}`} {...common}>
        <div className="flex flex-col gap-2">
          <div className="pr-1">
            <div
              className={
                colors.length <= 6
                  ? 'grid grid-cols-3 gap-2 justify-items-center'
                  : 'grid gap-2 justify-items-center'
              }
              style={colors.length <= 6 ? undefined : {
                gridTemplateColumns: `repeat(auto-fill, minmax(${colors.length > 24 ? 28 : colors.length > 12 ? 32 : 36}px, 1fr))`
              }}
            >
              {colors.map((color) => {
                const active = activeColor === color;
                const size = colors.length <= 6 ? 42 : (colors.length > 24 ? 28 : colors.length > 12 ? 32 : 36);
                return (
                  <button
                    key={color}
                    onClick={() => setActiveColor(color)}
                    className={`relative rounded-full transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-white/70 shadow-sm hover:scale-110 ${active ? 'ring-4 ring-white/70 scale-110' : 'ring-2 ring-white/10'}`}
                    style={{ backgroundColor: color, width: size, height: size }}
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
          </div>
          {colors.length > 12 && (
            <div className="text-center text-[10px] text-white/50 font-mono tracking-wide">
              {colors.length} colors
            </div>
          )}
        </div>
      </PanelWrapper>
    );
  };

  // Revert global width to w-48; only Actions panel given extra width
  return <div className={`w-48 shrink-0 flex flex-col gap-4 ${side === 'right' ? '' : ''}`}>{order.map((k, idx) => renderPanel(k, idx))}</div>;
};
