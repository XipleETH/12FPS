// Engines disponibles
// Engines disponibles:
//  - mangaPen: vector-like entintado con taper y jitter
//  - pencil: (antiguo) granular; ahora usado por 'lapicero' (fino) y 'charcoal'
//  - wash: simulación de manchas semitransparentes (acuarela)
//  - acrylic: pincel opaco con ligera textura y borde suave
export type BrushEngine = 'mangaPen' | 'pencil' | 'wash' | 'acrylic';

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
  texture?: 'pencil' | 'marker' | 'rough' | 'charcoal' | 'wash' | 'acrylic' | 'none';
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
    },
    {
      id: 'acrilico',
      name: 'Acrílico',
      engine: 'acrylic',
      size: 10,
      opacity: 0.95,
      taper: 0.15,
      jitter: 0.04,
      hardness: 0.7,
      texture: 'acrylic'
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
      id: 'acuarela',
      name: 'Acuarela',
      engine: 'wash',
      size: 18,
      opacity: 0.35,
      taper: 0.4,
      jitter: 0.1,
      hardness: 0.3,
      texture: 'wash'
    },
    {
      id: 'lapicero',
      name: 'Lapicero',
      engine: 'pencil',
      size: 5,
      opacity: 0.8,
      taper: 0.5,
      jitter: 0.06,
      hardness: 0.8,
      texture: 'pencil'
    }
  ],
  graffiti: [],
};

// Helper: lista plana de todos los presets
export const allBrushPresets = Object.values(brushKits).flat();
