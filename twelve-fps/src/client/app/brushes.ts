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
	anime: [],
	comic: [],
	watercolor: [],
	graffiti: [],
};
