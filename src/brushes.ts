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
  texture?: 'pencil' | 'marker' | 'rough' | 'charcoal' | 'none';
}

// Preset inicial del pincel de tinta manga: líneas nítidas con ligera variación
// Ajustes futuros: dinámica de presión simulada y estabilizador configurable
export const brushKits: Record<BrushStyle, BrushPreset[]> = {
  anime: [
    {
      id: 'ink',
      name: 'Ink',
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
      id: 'marker',
      name: 'Marker',
      engine: 'mangaPen',
      size: 9,
      opacity: 0.9,
      taper: 0.2, // marcador casi plano
      jitter: 0.01,
      texture: 'marker'
    },
    {
      id: 'charcoal',
      name: 'Charcoal',
      engine: 'pencil',
      size: 12,
      opacity: 0.65,
      taper: 0.15,
      jitter: 0.12,
      hardness: 0.4,
      texture: 'charcoal'
    }
  ],
  watercolor: [
    {
      id: 'pencil',
      name: 'Pencil',
      engine: 'pencil',
      size: 8,
      opacity: 0.55,
      taper: 0.2,
      jitter: 0.08,
      hardness: 0.6,
      texture: 'rough'
    }
  ],
  graffiti: [],
};

// Helper: lista plana de todos los presets
export const allBrushPresets = Object.values(brushKits).flat();
