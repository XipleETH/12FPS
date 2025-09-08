import React, { forwardRef, useRef, useEffect, useState } from 'react';
import type { BrushPreset } from '../brushes';

interface CanvasProps {
  activeColor: string;
  brushSize: number;
  isDrawing: boolean;
  setIsDrawing: (drawing: boolean) => void;
  disabled?: boolean;
  brushMode?: 'solid' | 'soft' | 'fade' | 'spray';
  brushPreset?: BrushPreset;
  // Active tool selection
  tool?: 'draw' | 'erase' | 'fill';
  // Called once right before a mutating action (stroke start or fill)
  onBeforeMutate?: () => void;
  // Controlled zoom props (optional). If not provided, the component manages its own zoom internally.
  zoom?: number;
  // Onion skin (previous frame) overlay
  onionImage?: string;
  onionOpacity?: number; // 0..1
}

const FIXED_WIDTH = 540; // nuevo tamaño solicitado
const FIXED_HEIGHT = 960;

export const Canvas = forwardRef<HTMLCanvasElement, CanvasProps>(
  ({ activeColor, brushSize, isDrawing, setIsDrawing, disabled, brushMode = 'solid', brushPreset, tool = 'draw', onBeforeMutate, zoom: controlledZoom, onionImage, onionOpacity = 0.4 }, ref) => {
    const internalRef = useRef<HTMLCanvasElement>(null);
    const canvasRef = (ref as React.RefObject<HTMLCanvasElement>) || internalRef;
    const lastPointRef = useRef<{ x: number; y: number } | null>(null);
    const strokeProgressRef = useRef<number>(0); // para modo fade
  const containerRef = useRef<HTMLDivElement>(null);
  // Internal zoom state only used when no controlled zoom is supplied
  const [internalZoom] = useState(1);
  const zoom = controlledZoom ?? internalZoom;
  const penActionRef = useRef<'draw' | 'erase' | 'pan' | null>(null);
  const eraseRef = useRef(false);
  const activeDrawPointerIdRef = useRef<number | null>(null);
  const activePanPointerIdRef = useRef<number | null>(null);

  useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = FIXED_WIDTH * dpr;
      canvas.height = FIXED_HEIGHT * dpr;
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, FIXED_WIDTH, FIXED_HEIGHT);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }, []);

  // mouse pos helper removed (pointer events compute directly)

  // touch drawing removed (single-finger pans, stylus uses pointer events)

    const hexToRgba = (hex: string, alpha: number) => {
      let h = hex.replace('#', '');
      if (h.length === 3) {
        h = h.split('').map(c => c + c).join('');
      }
      const bigint = parseInt(h, 16);
      const r = (bigint >> 16) & 255;
      const g = (bigint >> 8) & 255;
      const b = bigint & 255;
      return `rgba(${r},${g},${b},${alpha})`;
    };

    const hexToRgbTuple = (hex: string): [number, number, number, number] => {
      let h = hex.replace('#', '');
      if (h.length === 3) {
        h = h.split('').map(c => c + c).join('');
      }
      const bigint = parseInt(h, 16);
      const r = (bigint >> 16) & 255;
      const g = (bigint >> 8) & 255;
      const b = bigint & 255;
      return [r, g, b, 255];
    };

    const drawLine = (from: { x: number; y: number }, to: { x: number; y: number }) => {
      const canvas = canvasRef.current;
      if (!canvas || disabled) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      // Resolve preset params with sensible defaults
      const opacityMul = Math.max(0, Math.min(1, brushPreset?.opacity ?? 1));
      const jitter = Math.max(0, Math.min(1, brushPreset?.jitter ?? 0));
      const taper = Math.max(0, Math.min(1, brushPreset?.taper ?? 0));
      const hardness = Math.max(0, Math.min(1, brushPreset?.hardness ?? 0.5));
      const densityMul = Math.max(0.1, brushPreset?.density ?? 1);
      const particleRange: [number, number] | null = brushPreset?.particleSize ?? null;
      const drip = !!brushPreset?.drip;

      // Helper to jitter a point by up to brushSize * jitter
      const jitterPoint = (pt: {x:number;y:number}) => {
        if (jitter <= 0) return pt;
        const r = brushSize * jitter;
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * r;
        return { x: pt.x + Math.cos(a) * d, y: pt.y + Math.sin(a) * d };
      };
      // SPRAY mode draws first (particle based); early return after processing
      if (brushMode === 'spray') {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.hypot(dx, dy);
        const stepSpacing = Math.max(1, brushSize * 0.4);
        const steps = Math.max(1, Math.floor(dist / stepSpacing));
        const radius = brushSize / 2;
        // density control with preset multiplier
        const basePps = Math.min(60, Math.max(6, Math.floor(brushSize * 2)));
        const particlesPerStep = Math.max(1, Math.floor(basePps * densityMul));
        ctx.fillStyle = activeColor;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
            const cx = from.x + dx * t;
            const cy = from.y + dy * t;
            for (let p = 0; p < particlesPerStep; p++) {
              const angle = Math.random() * Math.PI * 2;
              const rr = Math.random() * radius;
              const px = cx + Math.cos(angle) * rr;
              const py = cy + Math.sin(angle) * rr;
              const alpha = (0.15 + Math.random() * 0.55) * opacityMul;
              ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
              const pr = particleRange
                ? (particleRange[0] + Math.random() * (particleRange[1] - particleRange[0]))
                : Math.max(0.8, brushSize * 0.08 + Math.random() * (brushSize * 0.12));
              ctx.beginPath();
              ctx.arc(px, py, pr, 0, Math.PI * 2);
              ctx.fill();
              // occasional drips
              if (drip && Math.random() < 0.06) {
                const len = Math.random() * brushSize * 1.2;
                const segments = Math.max(3, Math.floor(len / 3));
                let sy = py;
                for (let s = 0; s < segments; s++) {
                  const a2 = Math.max(0, alpha * (1 - s / segments));
                  ctx.globalAlpha = a2;
                  const pr2 = pr * (0.9 - 0.6 * (s / segments));
                  ctx.beginPath();
                  ctx.arc(px + (Math.random() - 0.5) * 1.2, sy + 1.5, Math.max(0.3, pr2), 0, Math.PI * 2);
                  ctx.fill();
                  sy += 1.5;
                }
              }
            }
        }
        ctx.globalAlpha = 1;
        return;
      }
      if (brushMode === 'solid') {
        // Apply taper, jitter and opacity
        const p0 = jitterPoint(from);
        const p1 = jitterPoint(to);
        const progress = strokeProgressRef.current;
        const taperFactor = 1 - taper * Math.min(1, progress / (200 + brushSize * 20));
        ctx.globalAlpha = opacityMul;
        ctx.strokeStyle = activeColor;
        ctx.lineWidth = Math.max(0.5, brushSize * taperFactor);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        return;
      }
      if (brushMode === 'fade') {
        const progress = strokeProgressRef.current;
        const alpha = Math.max(0.05, 1 - progress / 800) * opacityMul; // desvanecer progresivo + preset opacity
        const p0 = jitterPoint(from);
        const p1 = jitterPoint(to);
        const taperFactor = 1 - taper * Math.min(1, progress / (200 + brushSize * 20));
        ctx.strokeStyle = activeColor;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = Math.max(0.5, brushSize * taperFactor);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
        strokeProgressRef.current += Math.hypot(to.x - from.x, to.y - from.y);
        ctx.globalAlpha = 1;
        return;
      }
  // soft brush: círculos con degradado radial entre puntos
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.hypot(dx, dy);
      const steps = Math.max(1, Math.floor(dist / (brushSize * 0.4)));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const baseX = from.x + dx * t;
        const baseY = from.y + dy * t;
        const jp = jitterPoint({ x: baseX, y: baseY });
        const x = jp.x;
        const y = jp.y;
        const radius = brushSize / 2;
        const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
        // hardness controls how sharp the center is; opacityMul multiplies peak alpha
        const centerAlpha = 0.9 * opacityMul;
        const innerStop = Math.max(0, Math.min(0.95, hardness));
        g.addColorStop(0, hexToRgba(activeColor, centerAlpha));
        g.addColorStop(innerStop, hexToRgba(activeColor, centerAlpha * 0.85));
        g.addColorStop(1, hexToRgba(activeColor, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

  // Old mouse handlers removed; pointer events unify behavior

    // Single-finger: pan (no drawing). Two-finger: pinch zoom. Pen stylus: drawing.
    const panState = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);

  // Helper removed (no touch drawing with stylus now)

  // Touch events: let the browser handle scrolling for finger pan; no drawing on touch
  const handleTouchStart = (_e: React.TouchEvent<HTMLCanvasElement>) => {};
  const handleTouchMove = (_e: React.TouchEvent<HTMLCanvasElement>) => {};
  const handleTouchEnd = (_e: React.TouchEvent<HTMLCanvasElement>) => {};

  const floodFill = (x: number, y: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width; // already in device pixels
      const h = canvas.height;
      // Logical -> device pixel coords
      const sx = Math.floor(x * dpr);
      const sy = Math.floor(y * dpr);
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;

      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data; // Uint8ClampedArray
      const idx = (sy * w + sx) * 4;
      const targetR = data[idx];
      const targetG = data[idx + 1];
      const targetB = data[idx + 2];
      const targetA = data[idx + 3];

  const [fillR, fillG, fillB] = hexToRgbTuple(activeColor);
  const opacityMul = Math.max(0, Math.min(1, brushPreset?.opacity ?? 1));
  const hardness = Math.max(0, Math.min(1, brushPreset?.hardness ?? 0.5));
  const densityMul = Math.max(0.1, brushPreset?.density ?? 1);
  const particleRange: [number, number] | null = brushPreset?.particleSize ?? null;
      const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
      const T = 16; // antialiasing tolerance
      const matchesTarget = (i: number) => near(data[i], targetR, T) && near(data[i + 1], targetG, T) && near(data[i + 2], targetB, T) && near(data[i + 3], targetA, T);

      // Build region mask via scanline flood fill
      const mask = new Uint8Array(w * h);
      let minX = sx, maxX = sx, minY = sy, maxY = sy;
      const stack: Array<[number, number]> = [[sx, sy]];
      while (stack.length) {
        const [px, py] = stack.pop()!;
        let nx = px;
        let m = py * w + nx;
        let i = m * 4;
        // move left to span start
        while (nx >= 0 && !mask[m] && matchesTarget(i)) {
          nx--;
          m--;
          i -= 4;
        }
        nx++;
        m++;
        i += 4;
        let spanUp = false;
        let spanDown = false;
        while (nx < w && !mask[m] && matchesTarget(i)) {
          // mark mask
          mask[m] = 1;
          if (nx < minX) minX = nx; if (nx > maxX) maxX = nx;
          if (py < minY) minY = py; if (py > maxY) maxY = py;
          // scan up
          if (py > 0) {
            const am = m - w; const ai = i - w * 4;
            if (!spanUp && !mask[am] && matchesTarget(ai)) {
              stack.push([nx, py - 1]);
              spanUp = true;
            } else if (spanUp && (mask[am] || !matchesTarget(ai))) {
              spanUp = false;
            }
          }
          // scan down
          if (py < h - 1) {
            const bm = m + w; const bi = i + w * 4;
            if (!spanDown && !mask[bm] && matchesTarget(bi)) {
              stack.push([nx, py + 1]);
              spanDown = true;
            } else if (spanDown && (mask[bm] || !matchesTarget(bi))) {
              spanDown = false;
            }
          }
          nx++;
          m++;
          i += 4;
        }
      }

      // Early out if trivial
      if (minX > maxX || minY > maxY) return;

      if (brushMode === 'spray') {
        // Spray particles randomly inside the mask using existing spray style
        const bboxW = maxX - minX + 1;
        const bboxH = maxY - minY + 1;
        const radius = Math.max(1, Math.floor(brushSize * dpr) / 2);
        const area = bboxW * bboxH;
        const density = Math.floor(
          Math.min(12000, Math.max(800, Math.floor((area / 50) * Math.max(0.6, brushSize / 12)))) * densityMul
        );
        ctx.save();
        ctx.fillStyle = activeColor;
        for (let p = 0; p < density; p++) {
          const rx = minX + Math.floor(Math.random() * bboxW);
          const ry = minY + Math.floor(Math.random() * bboxH);
          if (!mask[ry * w + rx]) continue;
          const alpha = (0.15 + Math.random() * 0.55) * opacityMul;
          ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
          // random offset within small disc
          const ang = Math.random() * Math.PI * 2;
          const rr = Math.random() * radius;
          const px = rx + Math.cos(ang) * rr;
          const py = ry + Math.sin(ang) * rr;
          ctx.beginPath();
          const pr = particleRange
            ? (particleRange[0] + Math.random() * (particleRange[1] - particleRange[0]))
            : Math.max(0.8, brushSize * 0.08 + Math.random() * (brushSize * 0.12));
          ctx.arc(px / dpr, py / dpr, pr, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        return;
      }

      // Solid / Soft / Fade computed by blending into imageData
      const blendPixel = (di: number, a: number) => {
        const inv = 1 - a;
        const dr = data[di];
        const dg = data[di + 1];
        const db = data[di + 2];
        const da = data[di + 3] / 255;
        const outA = a + da * inv;
        const outR = Math.round(fillR * a + dr * inv);
        const outG = Math.round(fillG * a + dg * inv);
        const outB = Math.round(fillB * a + db * inv);
        data[di] = outR;
        data[di + 1] = outG;
        data[di + 2] = outB;
        data[di + 3] = Math.round(outA * 255);
      };

      if (brushMode === 'solid') {
        for (let y0 = minY; y0 <= maxY; y0++) {
          let m = y0 * w + minX;
          let di = m * 4;
          for (let x0 = minX; x0 <= maxX; x0++, m++, di += 4) {
            if (!mask[m]) continue;
            if (opacityMul >= 0.999) {
              data[di] = fillR; data[di + 1] = fillG; data[di + 2] = fillB; data[di + 3] = 255;
            } else {
              blendPixel(di, opacityMul);
            }
          }
        }
        ctx.putImageData(imageData, 0, 0);
        return;
      }

  if (brushMode === 'fade') {
        const maxDist = Math.max(8, Math.hypot(maxX - minX, maxY - minY) * 0.75);
        for (let y0 = minY; y0 <= maxY; y0++) {
          let m = y0 * w + minX;
          let di = m * 4;
          for (let x0 = minX; x0 <= maxX; x0++, m++, di += 4) {
            if (!mask[m]) continue;
            const dx = x0 - sx;
            const dy = y0 - sy;
            const dist = Math.hypot(dx, dy);
    const a = Math.max(0.05, Math.min(1, 1 - dist / maxDist)) * opacityMul;
            blendPixel(di, a);
          }
        }
        ctx.putImageData(imageData, 0, 0);
        return;
      }

      // brushMode === 'soft' => stronger opacity near interior, soft falloff at edges based on distance to non-mask
    const R = Math.max(2, Math.floor(brushSize * dpr));
      // Precompute a small kernel of offsets up to radius R using Chebyshev distance
      const offsets: Array<{dx: number; dy: number; d: number}> = [];
      for (let d = 1; d <= R; d++) {
        for (let dy = -d; dy <= d; dy++) {
          for (let dx = -d; dx <= d; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue; // ring only
            offsets.push({ dx, dy, d });
          }
        }
      }
      for (let y0 = minY; y0 <= maxY; y0++) {
        let m = y0 * w + minX;
        let di = m * 4;
        for (let x0 = minX; x0 <= maxX; x0++, m++, di += 4) {
          if (!mask[m]) continue;
          // if near edge (neighbor outside mask within R), compute distance
          let edgeD = R;
          for (let k = 0; k < offsets.length; k++) {
            const ox = x0 + offsets[k].dx;
            const oy = y0 + offsets[k].dy;
            if (ox < 0 || oy < 0 || ox >= w || oy >= h) { edgeD = Math.min(edgeD, offsets[k].d); break; }
            if (!mask[oy * w + ox]) { edgeD = Math.min(edgeD, offsets[k].d); break; }
          }
      const base = Math.max(0.25, Math.min(1, edgeD / R));
      // hardness shapes the edge response: higher hardness -> sharper edge (lower exponent)
      const expo = 2 - 1.5 * Math.max(0, Math.min(1, hardness)); // hardness 0 -> 2, hardness 1 -> 0.5
      const a = Math.pow(base, expo) * opacityMul;
      blendPixel(di, Math.max(0, Math.min(1, a)));
        }
      }
      ctx.putImageData(imageData, 0, 0);
    };

    const beginStroke = (pos: {x:number;y:number}, erase: boolean) => {
      // Snapshot once per mutation
      onBeforeMutate?.();
      strokeProgressRef.current = 0;
      lastPointRef.current = pos;
      eraseRef.current = erase;
      setIsDrawing(!erase);
    };

    const endStroke = () => {
      setIsDrawing(false);
      lastPointRef.current = null;
      eraseRef.current = false;
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (disabled) return;
      
      // Si ya estamos dibujando con otro puntero, ignorar nuevos punteros (evitar pan + draw simultáneos)
      if ((penActionRef.current === 'draw' || penActionRef.current === 'erase') && activeDrawPointerIdRef.current !== e.pointerId) {
        return;
      }

      // Capturar el pointer solo para mouse/pen, nunca para touch (gestión propia de pan)
      if (e.pointerType !== 'touch') {
        (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
      }
      
      // Clear any previous action
      penActionRef.current = null;
      panState.current = null;
      
  const container = containerRef.current!;
  const native = e.nativeEvent as PointerEvent & { offsetX: number; offsetY: number };
  const pos = { x: native.offsetX / zoom, y: native.offsetY / zoom };
      const buttons = e.buttons;

      // Fill tool: perform on primary click with mouse/pen. Touch remains pan-only by design.
    if (tool === 'fill' && e.pointerType !== 'touch') {
        if ((e.pointerType === 'mouse' && (buttons & 1)) || (e.pointerType === 'pen' && (buttons & 1))) {
      onBeforeMutate?.();
          floodFill(pos.x, pos.y);
          return; // no drawing state, single action
        }
      }
      
      if (e.pointerType === 'pen') {
        // Priority order: eraser > drawing > panning
        if ((buttons & 32) || (buttons & 4) || tool === 'erase') { // eraser button or middle button or active erase tool
          penActionRef.current = 'erase';
          activeDrawPointerIdRef.current = e.pointerId;
          beginStroke(pos, true);
        } else if (buttons & 1) { // pen tip (primary button) - drawing has priority over barrel button
          penActionRef.current = 'draw';
          activeDrawPointerIdRef.current = e.pointerId;
          beginStroke(pos, false);
        } else if (buttons & 2) { // barrel button only (secondary button) - pan only when not drawing
          penActionRef.current = 'pan';
          activePanPointerIdRef.current = e.pointerId;
          panState.current = { x: e.clientX, y: e.clientY, scrollLeft: container.scrollLeft, scrollTop: container.scrollTop };
        }
      } else if (e.pointerType === 'mouse') {
        if (buttons & 2) { // right button - pan
          penActionRef.current = 'pan';
          activePanPointerIdRef.current = e.pointerId;
          panState.current = { x: e.clientX, y: e.clientY, scrollLeft: container.scrollLeft, scrollTop: container.scrollTop };
    } else if (buttons & 1) { // left button - draw/erase based on tool
          if (tool === 'erase') {
            penActionRef.current = 'erase';
      activeDrawPointerIdRef.current = e.pointerId;
            beginStroke(pos, true);
          } else {
            penActionRef.current = 'draw';
            activeDrawPointerIdRef.current = e.pointerId;
            beginStroke(pos, false);
          }
        }
      } else if (e.pointerType === 'touch') {
        // Si ya se está dibujando con pen/mouse, ignorar pan táctil
        if (penActionRef.current === 'draw' || penActionRef.current === 'erase') return;
        // Pan con un dedo (sin dibujar)
        penActionRef.current = 'pan';
        activePanPointerIdRef.current = e.pointerId;
        panState.current = { x: e.clientX, y: e.clientY, scrollLeft: container.scrollLeft, scrollTop: container.scrollTop };
      }
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (disabled) return;
  if (!penActionRef.current) return;
      
      const container = containerRef.current!;
      
  // Handle panning - only when explicitly in pan mode and for the same pointer
  if (penActionRef.current === 'pan' && panState.current && activePanPointerIdRef.current === e.pointerId) {
        const dx = e.clientX - panState.current.x;
        const dy = e.clientY - panState.current.y;
        container.scrollLeft = panState.current.scrollLeft - dx;
        container.scrollTop = panState.current.scrollTop - dy;
        return; // Early return to prevent any drawing action
      }
      
      // Handle drawing/erasing - only when explicitly in draw or erase mode
  if ((penActionRef.current === 'draw' || penActionRef.current === 'erase') && lastPointRef.current && activeDrawPointerIdRef.current === e.pointerId) {
        const native = e.nativeEvent as PointerEvent & { offsetX: number; offsetY: number };
        const pos = { x: native.offsetX / zoom, y: native.offsetY / zoom };
        
        if (penActionRef.current === 'erase') {
          const ctx = canvasRef.current?.getContext('2d');
          if (ctx) {
            ctx.save();
            ctx.globalCompositeOperation = 'destination-out';
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = 'rgba(0,0,0,1)';
            ctx.lineWidth = brushSize;
            ctx.beginPath();
            ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
            ctx.restore();
          }
        } else {
          drawLine(lastPointRef.current, pos);
        }
        lastPointRef.current = pos;
      }
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
      // Liberar la captura del pointer (si no es touch)
      if (e.pointerType !== 'touch') {
        (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);
      }
      
      // Clean up based on current action
      if (penActionRef.current === 'pan' && activePanPointerIdRef.current === e.pointerId) {
        panState.current = null;
        activePanPointerIdRef.current = null;
      } else if (penActionRef.current === 'draw' || penActionRef.current === 'erase') {
        if (activeDrawPointerIdRef.current === e.pointerId) {
          endStroke();
          activeDrawPointerIdRef.current = null;
        }
      }
      
      // Clear action only if the finishing pointer matches
      if (penActionRef.current && ((penActionRef.current === 'pan' && activePanPointerIdRef.current === null) || (penActionRef.current !== 'pan' && activeDrawPointerIdRef.current === null))) {
        penActionRef.current = null;
      }
    };

  // Eliminado bloqueo global; confiamos en touch-action local del canvas para evitar desplazamientos.

    return (
      <div
        ref={containerRef}
        className="relative border rounded-lg bg-white inline-block overflow-auto"
        style={{ width: FIXED_WIDTH, height: FIXED_HEIGHT }}
      >
        <div
          className="relative"
          style={{ width: FIXED_WIDTH * zoom, height: FIXED_HEIGHT * zoom }}
        >
          {onionImage && (
            <img
              src={onionImage}
              alt="previous frame"
              className="absolute inset-0 pointer-events-none"
              style={{ width: '100%', height: '100%', objectFit: 'fill', opacity: Math.max(0, Math.min(1, onionOpacity)) }}
            />
          )}
          <canvas
            ref={canvasRef}
            width={FIXED_WIDTH}
            height={FIXED_HEIGHT}
            className={`${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-crosshair'} absolute inset-0 bg-white select-none`}
            data-drawing={isDrawing ? 'true' : 'false'}
            style={{
              width: '100%',
              height: '100%',
              // Bloquear gestos del navegador; pan táctil gestionado por pointer events
              touchAction: 'none'
            }}
            // mouse handled via pointer events
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onContextMenu={(e) => e.preventDefault()}
          />
        </div>
        {disabled && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <p className="text-white font-semibold text-lg">Start session to draw</p>
          </div>
        )}
      </div>
    );
  }
);