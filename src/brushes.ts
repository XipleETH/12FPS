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
    { id: 'anime-gpen', name: 'G‑Pen (Lineart)', engine: 'solid', size: 6, opacity: 1, taper: 0.7, jitter: 0.02, texture: 'none' },
    { id: 'anime-marupen', name: 'Maru Pen (Micro Liner)', engine: 'solid', size: 3, opacity: 1, taper: 0.55, jitter: 0.005, texture: 'none' },
    { id: 'anime-brushpen', name: 'Brush Pen (Elastic)', engine: 'solid', size: 10, opacity: 0.95, taper: 0.8, jitter: 0.04, texture: 'marker' },
    { id: 'anime-mech-pencil', name: 'Mechanical Pencil (Clean)', engine: 'solid', size: 4, opacity: 0.6, taper: 0.25, jitter: 0.06, texture: 'pencil' },
    { id: 'anime-airbrush', name: 'Airbrush (Highlight)', engine: 'soft', size: 28, opacity: 0.22, hardness: 0.2 },
    { id: 'anime-softshade', name: 'Soft Shadow (Glaze)', engine: 'soft', size: 24, opacity: 0.3, hardness: 0.35 },
    { id: 'anime-speedline', name: 'Speed Line (Taper Fade)', engine: 'fade', size: 5, opacity: 1, taper: 0.9 },
    { id: 'anime-tone', name: 'Tone Stipple (Dots)', engine: 'spray', size: 18, opacity: 0.85, density: 0.6, particleSize: [1.2, 2.0] },
  ],
  comic: [],
  watercolor: [],
  graffiti: [],
};
