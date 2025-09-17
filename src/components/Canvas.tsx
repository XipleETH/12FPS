import React, { forwardRef, useRef, useEffect, useState } from 'react';
import type { BrushPreset } from '../brushes';

interface CanvasProps {
  activeColor: string;
  brushSize: number;
  isDrawing: boolean;
  setIsDrawing: (drawing: boolean) => void;
  disabled?: boolean;
  // Único engine actual: mangaPen
  brushPreset?: BrushPreset; // se usará size/opacity/taper/jitter
  // Active tool selection
  tool?: 'draw' | 'erase' | 'fill';
  // Called once right before a mutating action (stroke start or fill)
  onBeforeMutate?: () => void;
  // Controlled zoom props (optional). If not provided, the component manages its own zoom internally.
  zoom?: number;
  // Onion skin (previous frame) overlay
  onionImage?: string;
  onionOpacity?: number; // 0..1
  // Called after a drawing mutation (end of stroke segment / fill) to allow external persistence
  onDirty?: () => void;
  // Optional image (dataURL) to restore onto a freshly mounted/cleared canvas
  restoreImage?: string | null;
}

// Default fallback size (desktop)
const DEFAULT_WIDTH = 540;
const DEFAULT_HEIGHT = 740;

export const Canvas = forwardRef<HTMLCanvasElement, CanvasProps>(
  ({ activeColor, brushSize, isDrawing, setIsDrawing, disabled, brushPreset, tool = 'draw', onBeforeMutate, zoom: controlledZoom, onionImage, onionOpacity = 0.4, onDirty, restoreImage }, ref) => {
  const internalRef = useRef<HTMLCanvasElement>(null);
    const canvasRef = (ref as React.RefObject<HTMLCanvasElement>) || internalRef;
    const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const strokeProgressRef = useRef<number>(0); // distancia acumulada
  // Buffer para estabilización (line smoothing) tipo ventana móvil
  const smoothBuffer = useRef<Array<{x:number;y:number;t:number;pressure:number}>>([]);
  // Flag para evitar que el primer movimiento genere línea conectando con stroke previo
  const firstMoveRef = useRef<boolean>(false);
  // Guardamos la posición inicial para poder dibujar un "tap" como punto
  const strokeStartPosRef = useRef<{x:number;y:number}|null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Internal zoom state only used when no controlled zoom is supplied
  const [internalZoom] = useState(1);
  const zoom = controlledZoom ?? internalZoom;
  const penActionRef = useRef<'draw' | 'erase' | 'pan' | null>(null);
  const eraseRef = useRef(false);
  const activeDrawPointerIdRef = useRef<number | null>(null);
  const activePanPointerIdRef = useRef<number | null>(null);

    // Responsive size (full viewport on mobile)
    const [displaySize, setDisplaySize] = useState<{w:number;h:number}>({ w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT });
    const isMobile = () => window.innerWidth < 768;
    useEffect(() => {
      const update = () => {
        if (isMobile()) {
          // Use full visual viewport height if available (accounts for mobile URL bar)
          const vv = (window as any).visualViewport;
          const height = vv ? vv.height : window.innerHeight;
          setDisplaySize({ w: window.innerWidth, h: height });
        } else {
          setDisplaySize({ w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT });
        }
      };
      update();
      window.addEventListener('resize', update);
      if ((window as any).visualViewport) {
        (window as any).visualViewport.addEventListener('resize', update);
      }
      return () => {
        window.removeEventListener('resize', update);
        if ((window as any).visualViewport) {
          (window as any).visualViewport.removeEventListener('resize', update);
        }
      };
    }, []);

    // Initialize & resize canvas backing store when displaySize changes (only once content empty)
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(3, window.devicePixelRatio || 1); // cap dpr for memory
      const logicalW = displaySize.w;
      const logicalH = displaySize.h;
      // Resize backing store; this clears content
      canvas.width = Math.round(logicalW * dpr);
      canvas.height = Math.round(logicalH * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(1,0,0,1,0,0);
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, logicalW, logicalH);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }, [displaySize.w, displaySize.h]);

  // mouse pos helper removed (pointer events compute directly)

  // touch drawing removed (single-finger pans, stylus uses pointer events)

  // hexToRgba removido (no necesario para mangaPen, fill usa blending directo)

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

  const drawLine = (from: { x: number; y: number }, to: { x: number; y: number }, pressure: number) => {
      const canvas = canvasRef.current;
      if (!canvas || disabled) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      // Resolve preset params with sensible defaults
  const opacityMul = Math.max(0, Math.min(1, brushPreset?.opacity ?? 1));
  const jitter = Math.max(0, Math.min(1, brushPreset?.jitter ?? 0.02));
  const taper = Math.max(0, Math.min(1, brushPreset?.taper ?? 0.6));
  // Simulación de presión: si device no da pressure, usamos velocidad inversa
  // Usar siempre el valor dinámico del slider (brushSize) como autoridad.
  // El tamaño del preset solo sirve como valor inicial cuando se selecciona (SidePanels ya hace setBrushSize(p.size)).
  const baseSize = brushSize; // antes: brushPreset?.size || brushSize (causaba que el slider no tuviera efecto cuando había preset)
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const speed = dist; // px por frame event
  const simulatedPressure = pressure && pressure > 0 ? pressure : Math.max(0.15, Math.min(1, 1 - speed / 40));
  // Taper aplicado según progreso de stroke
  const progress = strokeProgressRef.current;
  const taperFactor = 1 - taper * Math.min(1, progress / (180 + baseSize * 14));

      // Helper para jitter mínimo orgánico
      const jitterPoint = (pt: {x:number;y:number}) => {
        if (jitter <= 0) return pt;
        const r = baseSize * jitter;
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * r;
        return { x: pt.x + Math.cos(a) * d, y: pt.y + Math.sin(a) * d };
      };
      if (brushPreset?.engine === 'pencil') {
        // Lápiz: múltiples micro trazos puntuales dentro de un óvalo con textura aleatoria
        const steps = Math.max(1, Math.floor(dist / Math.max(1, baseSize * 0.35)));
        const dirX = (to.x - from.x) / steps;
        const dirY = (to.y - from.y) / steps;
        const grainCountBase = 4 + Math.floor(baseSize * 0.6);
        const localOpacity = opacityMul * 0.9;
        for (let i = 0; i <= steps; i++) {
          const cx = from.x + dirX * i;
          const cy = from.y + dirY * i;
          const grains = grainCountBase + Math.floor(Math.random() * 3);
          for (let g = 0; g < grains; g++) {
            const ang = Math.random() * Math.PI * 2;
            const rad = (baseSize * 0.5) * Math.sqrt(Math.random());
            const gx = cx + Math.cos(ang) * rad * 0.6;
            const gy = cy + Math.sin(ang) * rad;
            const a = localOpacity * (0.25 + Math.random() * 0.55) * (pressure || simulatedPressure);
            ctx.globalAlpha = Math.min(1, a);
            const dotR = Math.max(0.4, baseSize * 0.08 + Math.random() * (baseSize * 0.15));
            ctx.beginPath();
            ctx.fillStyle = activeColor;
            ctx.arc(gx, gy, dotR, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
        strokeProgressRef.current += dist;
        return;
      }
      // Estilo manga (entintado): trazos vectoriales suavizados a partir de puntos bufferizados
      if (brushPreset?.texture === 'marker') {
        // Simulación marcador: ancho constante, relleno múltiple de pasadas semi-opacas con leve ruido perpendicular
        const passes = 3;
        const width = Math.max(1, baseSize * 0.85);
        const dirX = to.x - from.x;
        const dirY = to.y - from.y;
        const len = Math.hypot(dirX, dirY) || 1;
        const nx = -dirY / len; // normal
        const ny = dirX / len;
        for (let p = 0; p < passes; p++) {
          const offset = ((p - (passes - 1) / 2) / (passes)) * (width * 0.5);
          ctx.globalAlpha = opacityMul * (0.55 + 0.25 * Math.random());
          ctx.strokeStyle = activeColor;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.lineWidth = width * (0.92 + Math.random() * 0.1);
          ctx.beginPath();
          const jf = jitterPoint({ x: from.x + nx * offset, y: from.y + ny * offset });
          const jt = jitterPoint({ x: to.x + nx * offset, y: to.y + ny * offset });
          ctx.moveTo(jf.x, jf.y);
          ctx.lineTo(jt.x, jt.y);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        strokeProgressRef.current += dist;
        return;
      } else {
        const p0 = jitterPoint(from);
        const p1 = jitterPoint(to);
        ctx.globalAlpha = opacityMul;
        ctx.strokeStyle = activeColor;
        const pressureScale = simulatedPressure * taperFactor;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(0.5, baseSize * 0.4 + baseSize * 0.6 * pressureScale);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
        strokeProgressRef.current += dist;
        ctx.globalAlpha = 1;
      }
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
  const w = canvas.width; // device px
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

      // Relleno simple monocolor para mangaPen
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
    };

    const beginStroke = (pos: {x:number;y:number}, erase: boolean) => {
      // Snapshot once per mutation
      onBeforeMutate?.();
      strokeProgressRef.current = 0;
      lastPointRef.current = pos;
      eraseRef.current = erase;
  // Reset smoothing buffer para no enlazar con stroke previo
  smoothBuffer.current = [{...pos, t: performance.now(), pressure: 0.5}];
      firstMoveRef.current = true; // primera mov después de pointerDown se salta
      strokeStartPosRef.current = pos;
      setIsDrawing(!erase);
    };

    const endStroke = () => {
      // Si no hubo movimiento (tap) dibujamos un punto corto
      if (firstMoveRef.current && strokeStartPosRef.current && !eraseRef.current) {
        const p = strokeStartPosRef.current;
        // Dibujar un punto mínimo reutilizando drawLine (desplazamiento ínfimo)
        drawLine(p, {x: p.x + 0.01, y: p.y + 0.01}, 0.7);
      }
      setIsDrawing(false);
      lastPointRef.current = null;
      eraseRef.current = false;
  // Mark dirty at end of stroke to ensure persistence captures final state
  onDirty?.();
      firstMoveRef.current = false;
      strokeStartPosRef.current = null;
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

    // One-time restore of provided image
    const restoredRef = useRef(false);
    useEffect(() => {
      if (restoredRef.current) return;
      if (!restoreImage) return;
      const canvas = canvasRef.current; if (!canvas) return;
      const ctx = canvas.getContext('2d'); if (!ctx) return;
      const img = new Image();
      img.onload = () => {
        const dpr = Math.min(3, window.devicePixelRatio || 1);
        const logicalW = canvas.width / dpr;
        const logicalH = canvas.height / dpr;
        ctx.save();
        ctx.setTransform(1,0,0,1,0,0);
        ctx.scale(dpr, dpr);
        ctx.clearRect(0,0,logicalW,logicalH);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0,0,logicalW,logicalH);
        ctx.drawImage(img, 0, 0, logicalW, logicalH);
        ctx.restore();
        restoredRef.current = true;
      };
      img.src = restoreImage;
    }, [restoreImage]);

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
        
        const nativePressure = (e.nativeEvent as any).pressure as number | undefined;
        const pressure = typeof nativePressure === 'number' ? nativePressure : 0;
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
          // Saltar la primera actualización para evitar segmento conectivo inmediato
          if (firstMoveRef.current) {
            firstMoveRef.current = false;
            smoothBuffer.current.push({ ...pos, t: performance.now(), pressure });
            if (smoothBuffer.current.length > 6) smoothBuffer.current.shift();
            lastPointRef.current = pos; // solo actualizar referencia
            return;
          }
          // Smoothing: añadimos al buffer y usamos el punto anterior suavizado
          smoothBuffer.current.push({ ...pos, t: performance.now(), pressure });
          if (smoothBuffer.current.length > 6) smoothBuffer.current.shift();
          const pts = smoothBuffer.current;
          let fromPt = lastPointRef.current;
          let toPt = pos;
          if (pts.length >= 3) {
            // simple Chaikin midpoint smoothing
            const a = pts[pts.length - 3];
            const b = pts[pts.length - 2];
            const c = pts[pts.length - 1];
            const mid1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            const mid2 = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
            fromPt = mid1;
            toPt = mid2;
          }
          drawLine(fromPt, toPt, pressure);
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
        className="relative border rounded-lg bg-white inline-block overflow-hidden"
        style={{ width: displaySize.w, height: displaySize.h }}
      >
        <div
          className="relative"
          style={{ width: displaySize.w * zoom, height: displaySize.h * zoom }}
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
            className={`${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-crosshair'} absolute inset-0 bg-white select-none`}
            data-drawing={isDrawing ? 'true' : 'false'}
            style={{
              width: '100%',
              height: '100%',
              touchAction: 'none',
              opacity: 1
            }}
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