import React, { forwardRef, useRef, useEffect, useState } from 'react';

interface CanvasProps {
  activeColor: string;
  brushSize: number;
  isDrawing: boolean;
  setIsDrawing: (drawing: boolean) => void;
  disabled?: boolean;
  brushMode?: 'solid' | 'soft' | 'fade' | 'spray';
  // Controlled zoom props (optional). If not provided, the component manages its own zoom internally.
  zoom?: number;
}

const FIXED_WIDTH = 960; // nuevo tamaño solicitado
const FIXED_HEIGHT = 600;

export const Canvas = forwardRef<HTMLCanvasElement, CanvasProps>(
  ({ activeColor, brushSize, isDrawing, setIsDrawing, disabled, brushMode = 'solid', zoom: controlledZoom }, ref) => {
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

    const drawLine = (from: { x: number; y: number }, to: { x: number; y: number }) => {
      const canvas = canvasRef.current;
      if (!canvas || disabled) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      // SPRAY mode draws first (particle based); early return after processing
      if (brushMode === 'spray') {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.hypot(dx, dy);
        const stepSpacing = Math.max(1, brushSize * 0.4);
        const steps = Math.max(1, Math.floor(dist / stepSpacing));
        const radius = brushSize / 2;
        // density control
        const particlesPerStep = Math.min(60, Math.max(6, Math.floor(brushSize * 2)));
        ctx.fillStyle = activeColor;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
            const cx = from.x + dx * t;
            const cy = from.y + dy * t;
            for (let p = 0; p < particlesPerStep; p++) {
              const angle = Math.random() * Math.PI * 2;
              const r = Math.random() * radius;
              const px = cx + Math.cos(angle) * r;
              const py = cy + Math.sin(angle) * r;
              const alpha = 0.15 + Math.random() * 0.55;
              ctx.globalAlpha = alpha;
              ctx.beginPath();
              ctx.arc(px, py, Math.max(0.8, brushSize * 0.08 + Math.random() * (brushSize * 0.12)), 0, Math.PI * 2);
              ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
        return;
      }
      if (brushMode === 'solid') {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = activeColor;
        ctx.lineWidth = brushSize;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        return;
      }
      if (brushMode === 'fade') {
        const progress = strokeProgressRef.current;
        const alpha = Math.max(0.05, 1 - progress / 800); // desvanecer progresivo
        ctx.strokeStyle = activeColor;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = brushSize;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        strokeProgressRef.current += Math.hypot(to.x - from.x, to.y - from.y);
        return;
      }
  // soft brush: círculos con degradado radial entre puntos
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.hypot(dx, dy);
      const steps = Math.max(1, Math.floor(dist / (brushSize * 0.4)));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = from.x + dx * t;
        const y = from.y + dy * t;
        const radius = brushSize / 2;
        const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
        g.addColorStop(0, hexToRgba(activeColor, 0.9));
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

    const beginStroke = (pos: {x:number;y:number}, erase: boolean) => {
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
      
      if (e.pointerType === 'pen') {
        // Priority order: eraser > drawing > panning
        if ((buttons & 32) || (buttons & 4)) { // eraser button or middle button
          penActionRef.current = 'erase';
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
        } else if (buttons & 1) { // left button - draw
          penActionRef.current = 'draw';
          activeDrawPointerIdRef.current = e.pointerId;
          beginStroke(pos, false);
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
        <canvas
          ref={canvasRef}
          width={FIXED_WIDTH}
          height={FIXED_HEIGHT}
          className={`block bg-white select-none ${
            disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-crosshair'
          }`}
          data-drawing={isDrawing ? 'true' : 'false'}
          style={{
            width: FIXED_WIDTH * zoom,
            height: FIXED_HEIGHT * zoom,
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
        {disabled && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <p className="text-white font-semibold text-lg">Start session to draw</p>
          </div>
        )}
      </div>
    );
  }
);