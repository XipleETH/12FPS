import React from 'react';
import { brushKits, BrushStyle } from '../brushes';
import { ChevronLeft, ChevronRight, MoveUp, MoveDown, Save, Trash2, Undo2, Pencil, Eraser, PaintBucket } from 'lucide-react';

export type PanelKey = 'actions' | 'tools' | 'brushSize' | 'brushMode' | 'palette';

interface SidePanelsProps {
	side: 'left' | 'right';
	toggleSide: () => void;
	order: PanelKey[];
	setOrder: (o: PanelKey[]) => void;
	tool: 'draw' | 'erase' | 'fill';
	setTool: (t: 'draw' | 'erase' | 'fill') => void;
	brushSize: number;
	setBrushSize: (n: number) => void;
	brushSpacing?: number;
	setBrushSpacing?: (n: number) => void;
	brushOpacity?: number;
	setBrushOpacity?: (n: number) => void;
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

export const SidePanels: React.FC<SidePanelsProps> = (props) => {
	const { side, toggleSide, order, setOrder, tool, setTool, brushSize, setBrushSize, brushSpacing, setBrushSpacing, brushOpacity, setBrushOpacity, setBrushMode, brushStyle, setBrushStyle, brushPresetId, setBrushPresetId, colors, activeColor, setActiveColor, currentWeek, onSave, onClear, onUndo, disabled } = props;
	const move = (key: PanelKey, dir: -1 | 1) => {
		const idx = order.indexOf(key);
		const target = idx + dir;
		if (idx === -1 || target < 0 || target >= order.length) return;
		const newOrder: PanelKey[] = [...order];
		const removed = newOrder.splice(idx, 1)[0];
		if (!removed) return;
		newOrder.splice(target, 0, removed);
		setOrder(newOrder);
	};
	const renderPanel = (key: PanelKey, idx: number) => {
		const common = { side, onToggleSide: toggleSide, canUp: idx > 0, canDown: idx < order.length - 1, onUp: () => move(key, -1 as const), onDown: () => move(key, 1 as const) };
		if (key === 'actions') {
			return (
				<PanelWrapper key={key} title="Actions" {...common}>
					<div className="flex items-center justify-center gap-4">
						<button onClick={() => !disabled && onSave()} disabled={disabled} aria-label="Save Frame" className="p-3 rounded-full bg-emerald-500/70 hover:bg-emerald-500 text-white disabled:opacity-40 transition"><Save className="w-5 h-5" /></button>
						<button onClick={() => !disabled && onUndo?.()} disabled={disabled} aria-label="Undo" title="Undo" className="p-3 rounded-full bg-indigo-500/70 hover:bg-indigo-500 text-white disabled:opacity-40 transition"><Undo2 className="w-5 h-5" /></button>
						<button onClick={() => !disabled && onClear()} disabled={disabled} aria-label="Clear Canvas" className="p-3 rounded-full bg-red-500/70 hover:bg-red-500 text-white disabled:opacity-40 transition"><Trash2 className="w-5 h-5" /></button>
					</div>
				</PanelWrapper>
			);
		}
		if (key === 'tools') {
			return (
				<PanelWrapper key={key} title="Tools" {...common}>
					<div className="flex flex-wrap gap-2 justify-center">
						{['draw', 'erase', 'fill'].map((t) => (
							<button key={t} onClick={() => setTool(t as any)} disabled={disabled} aria-label={t} title={t} className={`p-1.5 rounded-full border transition flex items-center justify-center ${tool === t ? 'bg-white/30 border-white/60 text-white' : 'bg-white/10 border-white/20 text-white/70 hover:bg-white/20'} disabled:opacity-40`}>
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
			const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
			const IconGrow = ({ className }: { className?: string }) => (<svg viewBox="0 0 24 24" className={className}><circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2" fill="none" /></svg>);
			const IconShrink = ({ className }: { className?: string }) => (<svg viewBox="0 0 24 24" className={className}><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" fill="none" /><circle cx="12" cy="12" r="3" fill="currentColor" /></svg>);
			const IconSpacingMore = ({ className }: { className?: string }) => (<svg viewBox="0 0 24 24" className={className} stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round"><path d="M4 12h16" strokeDasharray="2 4" /></svg>);
			const IconSpacingLess = ({ className }: { className?: string }) => (<svg viewBox="0 0 24 24" className={className} stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round"><path d="M4 12h16" strokeDasharray="4 2" /></svg>);
			const IconOpacityHigh = ({ className }: { className?: string }) => (<svg viewBox="0 0 24 24" className={className} stroke="currentColor" strokeWidth="1.5" fill="none"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 12h16M12 4v16" opacity="0.6" /></svg>);
			const IconOpacityLow = ({ className }: { className?: string }) => (<svg viewBox="0 0 24 24" className={className} stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.6"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>);
			const btnCls = "p-1 rounded-md bg-white/15 hover:bg-white/30 text-white disabled:opacity-30 transition";
			return (
				<PanelWrapper key={key} title="Brush" {...common}>
					<div className="flex flex-row justify-between gap-1">
						{/* Size column */}
						<div className="flex flex-col items-center gap-1 w-1/3">
							<button onClick={() => !disabled && setBrushSize(clamp(brushSize + 2, 1, 50))} disabled={disabled} className={btnCls} aria-label="Increase size" title="Increase size"><IconGrow className="w-4 h-4" /></button>
							<input type="range" min={1} max={50} step={1} value={brushSize} disabled={disabled} onChange={(e) => setBrushSize(Number(e.target.value))} className="h-12 w-1 accent-white/80 cursor-pointer rotate-180" aria-label="Brush size" style={{ writingMode: 'vertical-lr' }} />
							<button onClick={() => !disabled && setBrushSize(clamp(brushSize - 2, 1, 50))} disabled={disabled} className={btnCls} aria-label="Decrease size" title="Decrease size"><IconShrink className="w-4 h-4" /></button>
							{/* numeric label removed */}
						</div>
						{/* Spacing column */}
						{setBrushSpacing && (
							<div className="flex flex-col items-center gap-1 w-1/3">
								<button onClick={() => !disabled && setBrushSpacing(clamp((brushSpacing ?? 4) + 1, 1, 30))} disabled={disabled} className={btnCls} aria-label="Increase spacing" title="Increase spacing"><IconSpacingMore className="w-4 h-4" /></button>
								<input type="range" min={1} max={30} step={1} value={brushSpacing ?? 4} disabled={disabled} onChange={(e) => setBrushSpacing(Number(e.target.value))} className="h-12 w-1 accent-white/80 cursor-pointer rotate-180" aria-label="Brush spacing" style={{ writingMode: 'vertical-lr' }} />
								<button onClick={() => !disabled && setBrushSpacing(clamp((brushSpacing ?? 4) - 1, 1, 30))} disabled={disabled} className={btnCls} aria-label="Decrease spacing" title="Decrease spacing"><IconSpacingLess className="w-4 h-4" /></button>
								{/* numeric label removed */}
							</div>
						)}
						{/* Opacity column */}
						{setBrushOpacity && (
							<div className="flex flex-col items-center gap-1 w-1/3">
								<button onClick={() => { if (disabled) return; const cur = brushOpacity ?? 1; const next = clamp(cur + 0.05, 0.05, 1); setBrushOpacity(next); }} disabled={disabled} className={btnCls} aria-label="Increase opacity" title="Increase opacity"><IconOpacityHigh className="w-4 h-4" /></button>
								<input type="range" min={5} max={100} step={1} value={Math.round((brushOpacity ?? 1) * 100)} disabled={disabled} onChange={(e) => setBrushOpacity(Number(e.target.value) / 100)} className="h-12 w-1 accent-white/80 cursor-pointer rotate-180" aria-label="Brush opacity" style={{ writingMode: 'vertical-lr' }} />
								<button onClick={() => { if (disabled) return; const cur = brushOpacity ?? 1; const next = clamp(cur - 0.05, 0.05, 1); setBrushOpacity(next); }} disabled={disabled} className={btnCls} aria-label="Decrease opacity" title="Decrease opacity"><IconOpacityLow className="w-4 h-4" /></button>
								{/* numeric label removed */}
							</div>
						)}
					</div>
				</PanelWrapper>
			);
		}
		if (key === 'brushMode') {
			return (
				<PanelWrapper key={key} title="Brushes" {...common}>
					<div className="flex items-center justify-center gap-1.5 mb-2">
						{(['anime', 'comic', 'watercolor', 'graffiti'] as BrushStyle[]).map((s) => {
							if (!s) return null;
							const label = s.substring(0,1).toUpperCase() + s.substring(1);
							return (
								<button key={s} onClick={() => setBrushStyle(s)} disabled={disabled} className={`px-2 py-0.5 rounded-full text-[10px] border transition ${s === brushStyle ? 'bg-white/30 text-white border-white/60' : 'bg-white/10 text-white/70 border-white/20 hover:bg-white/20'}`}>{label}</button>
							);
						})}
					</div>
					<div className="flex flex-wrap gap-2 justify-center">
						{(brushKits[brushStyle] ?? []).length === 0 ? (
							<div className="text-white/70 text-[11px] italic py-1">No brushes yet</div>
						) : (
							(brushKits[brushStyle] ?? []).map((p) => (
								<button key={p.id} onClick={() => { 
									setBrushPresetId(p.id); 
									// Map arbitrary engine names to legacy brushMode types used by this older client variant
									const engine = (p as any).engine as string;
									let mode: 'solid' | 'soft' | 'fade' | 'spray' = 'solid';
									if (engine === 'airbrush' || engine === 'spray') mode = 'spray';
									else if (engine === 'wash' || engine === 'watercolor') mode = 'soft';
									else if (engine === 'acrylic' || engine === 'mangaPen' || engine === 'ink') mode = 'solid';
									setBrushMode(mode);
									setBrushSize(p.size); 
									if (setBrushSpacing) setBrushSpacing((p as any).spacing ?? 4); 
								}} disabled={disabled} className={`px-2 py-1 rounded-md border text-[11px] transition ${p.id === brushPresetId ? 'bg-white/30 border-white/60 text-white' : 'bg-white/10 border-white/20 text-white/80 hover:bg-white/20'}`} title={`${p.name} · ${(p as any).engine}`}>{p.name}</button>
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
							<button key={color} onClick={() => setActiveColor(color)} className={`w-8 h-8 rounded-full relative transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-white/70 shadow-sm hover:scale-110 ${active ? 'ring-4 ring-white/70 scale-110' : 'ring-2 ring-white/10'}`} style={{ backgroundColor: color }} title={color}>
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
