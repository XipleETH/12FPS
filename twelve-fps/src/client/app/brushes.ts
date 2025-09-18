// Local copy of brushes for embedded Devvit build (avoid cross-root import issues)
export type BrushEngine = 'solid' | 'soft' | 'fade' | 'spray';

export type BrushStyle = 'anime' | 'comic' | 'watercolor' | 'graffiti';

export interface BrushPreset {
	id: string;
	name: string;
	engine: BrushEngine;
	size: number; // default size
	opacity?: number; // 0..1
	hardness?: number; // 0..1 for soft
	taper?: number; // 0..1 amount of end taper for solid/fade
	jitter?: number; // 0..1 positional jitter factor
	density?: number; // spray particles density multiplier
	particleSize?: [number, number]; // spray particle radius range in px
	drip?: boolean; // graffiti drip effect for spray
	texture?: 'pencil' | 'marker' | 'rough' | 'none';
}

export const brushKits: Record<BrushStyle, BrushPreset[]> = {
	anime: [
		{ id: 'ink', name: 'Ink', engine: 'solid', size: 6, opacity: 1, taper: 0.65, jitter: 0.02, texture: 'none' },
	],
	comic: [
		{ id: 'marker', name: 'Marker', engine: 'solid', size: 9, opacity: 0.9, taper: 0.2, jitter: 0.01, texture: 'marker' },
		{ id: 'charcoal', name: 'Charcoal', engine: 'soft', size: 12, opacity: 0.65, taper: 0.15, jitter: 0.12, hardness: 0.4, texture: 'rough' },
	],
	watercolor: [
		{ id: 'pencil', name: 'Pencil', engine: 'soft', size: 8, opacity: 0.55, taper: 0.2, jitter: 0.08, hardness: 0.6, texture: 'rough' },
	],
	graffiti: [],
};

export const allBrushPresets = Object.values(brushKits).flat();
