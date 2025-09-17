// Engines disponibles
export type BrushEngine = 'mangaPen' | 'pencil';

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

// Preset inicial del pincel de tinta manga: líneas nítidas con ligera variación
// Ajustes futuros: dinámica de presión simulada y estabilizador configurable
export const brushKits: Record<BrushStyle, BrushPreset[]> = {
  anime: [
    {
      id: 'manga-ink-fine',
      name: 'Manga Ink Fine',
      engine: 'mangaPen',
      size: 6,
      opacity: 1,
      taper: 0.65, // afinado final
      jitter: 0.02, // mínima vibración orgánica
      texture: 'none'
    }
  ],
  comic: [
    {
      id: 'manga-ink-bold',
      name: 'Manga Ink Bold',
      engine: 'mangaPen',
      size: 10,
      opacity: 1,
      taper: 0.55,
      jitter: 0.015,
      texture: 'none'
    }
  ],
  watercolor: [
    {
      id: 'pencil-hb',
      name: 'Pencil HB',
      engine: 'pencil',
      size: 8,
      opacity: 0.55,
      taper: 0.2,
      jitter: 0.08,
      hardness: 0.6,
      texture: 'rough'
    },
    {
      id: 'pencil-2b',
      name: 'Pencil 2B',
      engine: 'pencil',
      size: 10,
      opacity: 0.7,
      taper: 0.25,
      jitter: 0.1,
      hardness: 0.5,
      texture: 'rough'
    }
  ],
  graffiti: [],
};

// Helper: lista plana de todos los presets
export const allBrushPresets = Object.values(brushKits).flat();
