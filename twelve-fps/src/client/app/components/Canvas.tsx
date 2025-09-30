import React, { forwardRef, useRef, useEffect, useState } from 'react';
import type { BrushPreset } from '../brushes';

interface CanvasProps {
	activeColor: string;
	brushSize: number;
	brushSpacing?: number; // global spacing override (parity with main app)
	brushOpacity?: number; // 0..1 global override (currently unused)
	isDrawing: boolean;
	setIsDrawing: (drawing: boolean) => void;
	disabled?: boolean;
	brushMode?: 'solid' | 'soft' | 'fade' | 'spray';
	brushPreset?: BrushPreset | undefined;
	tool?: 'draw' | 'erase' | 'fill';
	onBeforeMutate?: () => void;
	zoom?: number;
	onionImage?: string | undefined;
	onionOpacity?: number; // 0..1
}

const FIXED_WIDTH = 480; // Logical drawing width
const FIXED_HEIGHT = 640; // Logical drawing height

export const Canvas = forwardRef<HTMLCanvasElement, CanvasProps>(
	({ activeColor, brushSize, brushSpacing: _brushSpacing, brushOpacity: _brushOpacity, isDrawing, setIsDrawing, disabled, brushMode = 'solid', brushPreset, tool = 'draw', onBeforeMutate, zoom: controlledZoom, onionImage, onionOpacity = 0.4 }, ref) => {
		const internalRef = useRef<HTMLCanvasElement>(null);
		const canvasRef = (ref as React.RefObject<HTMLCanvasElement>) || internalRef;
		const lastPointRef = useRef<{ x: number; y: number } | null>(null);
		const strokeProgressRef = useRef<number>(0);
		const containerRef = useRef<HTMLDivElement>(null);
		// User-controlled zoom (slider) remains separate from auto fit scaling.
		const [internalZoom] = useState(1);
		const userZoom = controlledZoom ?? internalZoom;
		// Auto scale to ensure the entire canvas fits on small (mobile) viewports without scroll.
		const [autoScale, setAutoScale] = useState(1);
		// Effective zoom used for sizing & pointer math (auto fit * user zoom)
		const zoom = userZoom * autoScale;
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

		// Compute auto scale so the full logical canvas fits within viewport (no scroll needed) on mobile.
		useEffect(() => {
			const computeScale = () => {
				const vw = window.innerWidth;
				const vh = window.innerHeight;
				// Reserve a small margin so it doesn't butt against edges (8px each side)
				const margin = 16;
				const scale = Math.min(1, (vw - margin) / FIXED_WIDTH, (vh - margin) / FIXED_HEIGHT);
				setAutoScale(scale <= 0 ? 1 : scale);
			};
			computeScale();
			window.addEventListener('resize', computeScale);
			return () => window.removeEventListener('resize', computeScale);
		}, []);

		const hexToRgba = (hex: string, alpha: number) => {
			let h = hex.replace('#', '');
			if (h.length === 3) h = h.split('').map(c => c + c).join('');
			const bigint = parseInt(h, 16);
			const r = (bigint >> 16) & 255;
			const g = (bigint >> 8) & 255;
			const b = bigint & 255;
			return `rgba(${r},${g},${b},${alpha})`;
		};

		const hexToRgbTuple = (hex: string): [number, number, number, number] => {
			let h = hex.replace('#', '');
			if (h.length === 3) h = h.split('').map(c => c + c).join('');
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
			const opacityMul = Math.max(0, Math.min(1, brushPreset?.opacity ?? 1));
			const jitter = Math.max(0, Math.min(1, brushPreset?.jitter ?? 0));
			const taper = Math.max(0, Math.min(1, brushPreset?.taper ?? 0));
			const hardness = Math.max(0, Math.min(1, brushPreset?.hardness ?? 0.5));
			const densityMul = Math.max(0.1, brushPreset?.density ?? 1);
			const particleRange: [number, number] | null = brushPreset?.particleSize ?? null;
			const drip = !!brushPreset?.drip;
			const jitterPoint = (pt: { x: number; y: number }) => {
				if (jitter <= 0) return pt;
				const r = brushSize * jitter;
				const a = Math.random() * Math.PI * 2;
				const d = Math.random() * r;
				return { x: pt.x + Math.cos(a) * d, y: pt.y + Math.sin(a) * d };
			};
			if (brushMode === 'spray') {
				const dx = to.x - from.x;
				const dy = to.y - from.y;
				const dist = Math.hypot(dx, dy);
				const stepSpacing = Math.max(1, brushSize * 0.4);
				const steps = Math.max(1, Math.floor(dist / stepSpacing));
				const radius = brushSize / 2;
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
						const pr = particleRange ? (particleRange[0] + Math.random() * (particleRange[1] - particleRange[0])) : Math.max(0.8, brushSize * 0.08 + Math.random() * (brushSize * 0.12));
						ctx.beginPath();
						ctx.arc(px, py, pr, 0, Math.PI * 2);
						ctx.fill();
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
					// Enhanced dual taper: pointed start & heuristic pointed end
					const p0 = jitterPoint(from);
					const p1 = jitterPoint(to);
					const progress = strokeProgressRef.current;
					// Classic progressive taper (reduces over stroke length)
					const classicTaper = 1 - taper * Math.min(1, progress / (200 + brushSize * 20));
					// Start ramp (fade in)
					const fadeLen = Math.max(12, brushSize * 3);
					const startFactor = Math.min(1, progress / fadeLen);
					// Heuristic end ramp: if stroke already long, gradually narrow when movement slows
					let endFactor = 1;
					if (progress > 2 * fadeLen) {
						// Approximate speed using segment length
						const segDx = p1.x - p0.x; const segDy = p1.y - p0.y; const segDist = Math.hypot(segDx, segDy);
						const speed = segDist; // pixels this segment
						const slow = Math.min(1, Math.max(0, (40 - speed) / 40)); // 0 fast .. 1 slow
						endFactor = 1 - 0.7 * (speed < 6 ? 1 : slow * 0.6);
						endFactor = Math.max(0.15, endFactor);
					}
					const dualTaper = Math.max(0.15, Math.min(1, startFactor * endFactor));
					const taperFactor = Math.min(classicTaper, dualTaper);
					ctx.globalAlpha = opacityMul;
					ctx.strokeStyle = activeColor;
					ctx.lineCap = 'round';
					ctx.lineJoin = 'round';
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
				const alpha = Math.max(0.05, 1 - progress / 800) * opacityMul;
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

		const panState = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);
		const handleTouchStart = (_e: React.TouchEvent<HTMLCanvasElement>) => {};
		const handleTouchMove = (_e: React.TouchEvent<HTMLCanvasElement>) => {};
		const handleTouchEnd = (_e: React.TouchEvent<HTMLCanvasElement>) => {};

		const floodFill = (x: number, y: number) => {
			const canvas = canvasRef.current;
			if (!canvas) return;
			const ctx = canvas.getContext('2d');
			if (!ctx) return;
			const dpr = window.devicePixelRatio || 1;
			const w = canvas.width;
			const h = canvas.height;
			const sx = Math.floor(x * dpr);
			const sy = Math.floor(y * dpr);
			if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;
			const imageData = ctx.getImageData(0, 0, w, h);
			const data = imageData.data;
			const idx = (sy * w + sx) * 4;
			const targetR = data[idx]!;
			const targetG = data[idx + 1]!;
			const targetB = data[idx + 2]!;
			const targetA = data[idx + 3]!;
			const [fillR, fillG, fillB] = hexToRgbTuple(activeColor);
			const opacityMul = Math.max(0, Math.min(1, brushPreset?.opacity ?? 1));
			const hardness = Math.max(0, Math.min(1, brushPreset?.hardness ?? 0.5));
			const densityMul = Math.max(0.1, brushPreset?.density ?? 1);
			const particleRange: [number, number] | null = brushPreset?.particleSize ?? null;
			const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
			const T = 16;
					const safe = (i: number): number => data[i] as number; // typed array index always yields number
					const matchesTarget = (i: number) => {
						// Fast bounds check (should not trigger normally)
						if (i < 0 || i + 3 >= data.length) return false;
						return near(safe(i), targetR, T) && near(safe(i + 1), targetG, T) && near(safe(i + 2), targetB, T) && near(safe(i + 3), targetA, T);
					};
			const mask = new Uint8Array(w * h);
			let minX = sx, maxX = sx, minY = sy, maxY = sy;
			const stack: Array<[number, number]> = [[sx, sy]];
			while (stack.length) {
				const [px, py] = stack.pop()!;
				let nx = px;
				let m = py * w + nx;
				let i = m * 4;
				while (nx >= 0 && !mask[m] && matchesTarget(i)) { nx--; m--; i -= 4; }
				nx++; m++; i += 4;
				let spanUp = false; let spanDown = false;
				while (nx < w && !mask[m] && matchesTarget(i)) {
					mask[m] = 1;
					if (nx < minX) minX = nx; if (nx > maxX) maxX = nx; if (py < minY) minY = py; if (py > maxY) maxY = py;
					if (py > 0) {
						const am = m - w; const ai = i - w * 4;
						if (!spanUp && !mask[am] && matchesTarget(ai)) { stack.push([nx, py - 1]); spanUp = true; }
						else if (spanUp && (mask[am] || !matchesTarget(ai))) spanUp = false;
					}
					if (py < h - 1) {
						const bm = m + w; const bi = i + w * 4;
						if (!spanDown && !mask[bm] && matchesTarget(bi)) { stack.push([nx, py + 1]); spanDown = true; }
						else if (spanDown && (mask[bm] || !matchesTarget(bi))) spanDown = false;
					}
					nx++; m++; i += 4;
				}
			}
			if (minX > maxX || minY > maxY) return;
					const blendPixel = (di: number, a: number) => {
						const inv = 1 - a;
						const dr = safe(di);
						const dg = safe(di + 1);
						const db = safe(di + 2);
						const da = safe(di + 3) / 255;
				const outA = a + da * inv;
				const outR = Math.round(fillR * a + dr * inv);
				const outG = Math.round(fillG * a + dg * inv);
				const outB = Math.round(fillB * a + db * inv);
				data[di] = outR; data[di + 1] = outG; data[di + 2] = outB; data[di + 3] = Math.round(outA * 255);
			};
			if (brushMode === 'spray') {
				const bboxW = maxX - minX + 1;
				const bboxH = maxY - minY + 1;
				const radius = Math.max(1, Math.floor(brushSize * dpr) / 2);
				const area = bboxW * bboxH;
				const density = Math.floor(Math.min(12000, Math.max(800, Math.floor((area / 50) * Math.max(0.6, brushSize / 12)))) * densityMul);
				ctx.save(); ctx.fillStyle = activeColor;
				for (let p = 0; p < density; p++) {
					const rx = minX + Math.floor(Math.random() * bboxW);
					const ry = minY + Math.floor(Math.random() * bboxH);
					if (!mask[ry * w + rx]) continue;
					const alpha = (0.15 + Math.random() * 0.55) * opacityMul;
					ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
					const ang = Math.random() * Math.PI * 2;
					const rr = Math.random() * radius;
					const px = rx + Math.cos(ang) * rr;
					const py = ry + Math.sin(ang) * rr;
					ctx.beginPath();
					const pr = particleRange ? (particleRange[0] + Math.random() * (particleRange[1] - particleRange[0])) : Math.max(0.8, brushSize * 0.08 + Math.random() * (brushSize * 0.12));
					ctx.arc(px / dpr, py / dpr, pr, 0, Math.PI * 2);
					ctx.fill();
				}
				ctx.restore();
				return;
			}
			if (brushMode === 'solid') {
				for (let y0 = minY; y0 <= maxY; y0++) {
					let m = y0 * w + minX; let di = m * 4;
					for (let x0 = minX; x0 <= maxX; x0++, m++, di += 4) {
						if (!mask[m]) continue;
						if (opacityMul >= 0.999) { data[di] = fillR; data[di + 1] = fillG; data[di + 2] = fillB; data[di + 3] = 255; }
						else blendPixel(di, opacityMul);
					}
				}
				ctx.putImageData(imageData, 0, 0); return;
			}
			if (brushMode === 'fade') {
				const maxDist = Math.max(8, Math.hypot(maxX - minX, maxY - minY) * 0.75);
				for (let y0 = minY; y0 <= maxY; y0++) {
					let m = y0 * w + minX; let di = m * 4;
					for (let x0 = minX; x0 <= maxX; x0++, m++, di += 4) {
						if (!mask[m]) continue;
						const dx = x0 - sx; const dy = y0 - sy; const dist = Math.hypot(dx, dy);
						const a = Math.max(0.05, Math.min(1, 1 - dist / maxDist)) * opacityMul;
						blendPixel(di, a);
					}
				}
				ctx.putImageData(imageData, 0, 0); return;
			}
			const R = Math.max(2, Math.floor(brushSize * dpr));
			const offsets: Array<{ dx: number; dy: number; d: number }> = [];
			for (let d = 1; d <= R; d++) {
				for (let dy2 = -d; dy2 <= d; dy2++) {
					for (let dx2 = -d; dx2 <= d; dx2++) {
						if (Math.max(Math.abs(dx2), Math.abs(dy2)) !== d) continue;
						offsets.push({ dx: dx2, dy: dy2, d });
					}
				}
			}
			for (let y0 = minY; y0 <= maxY; y0++) {
				let m = y0 * w + minX; let di = m * 4;
				for (let x0 = minX; x0 <= maxX; x0++, m++, di += 4) {
					if (!mask[m]) continue;
					let edgeD = R;
											for (let k = 0; k < offsets.length; k++) {
												const off = offsets[k]!;
												const ox = x0 + off.dx; const oy = y0 + off.dy;
												if (ox < 0 || oy < 0 || ox >= w || oy >= h) { edgeD = Math.min(edgeD, off.d); break; }
												if (!mask[oy * w + ox]) { edgeD = Math.min(edgeD, off.d); break; }
											}
					const base = Math.max(0.25, Math.min(1, edgeD / R));
					const expo = 2 - 1.5 * Math.max(0, Math.min(1, hardness));
					const a = Math.pow(base, expo) * opacityMul;
					blendPixel(di, Math.max(0, Math.min(1, a)));
				}
			}
			ctx.putImageData(imageData, 0, 0);
		};

		const beginStroke = (pos: { x: number; y: number }, erase: boolean) => {
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
			if ((penActionRef.current === 'draw' || penActionRef.current === 'erase') && activeDrawPointerIdRef.current !== e.pointerId) return;
			if (e.pointerType !== 'touch') (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
			penActionRef.current = null; panState.current = null;
			const native = e.nativeEvent as PointerEvent & { offsetX: number; offsetY: number };
			// Adjust pointer coords by effective zoom (auto fit * user zoom)
			const pos = { x: native.offsetX / zoom, y: native.offsetY / zoom };
			const buttons = e.buttons;
			if (tool === 'fill' && e.pointerType !== 'touch') {
				if ((e.pointerType === 'mouse' && (buttons & 1)) || (e.pointerType === 'pen' && (buttons & 1))) {
					onBeforeMutate?.(); floodFill(pos.x, pos.y); return;
				}
			}
			const container = containerRef.current!;
			if (e.pointerType === 'pen') {
				if ((buttons & 32) || (buttons & 4) || tool === 'erase') { penActionRef.current = 'erase'; activeDrawPointerIdRef.current = e.pointerId; beginStroke(pos, true); }
				else if (buttons & 1) { penActionRef.current = 'draw'; activeDrawPointerIdRef.current = e.pointerId; beginStroke(pos, false); }
				else if (buttons & 2) { penActionRef.current = 'pan'; activePanPointerIdRef.current = e.pointerId; panState.current = { x: e.clientX, y: e.clientY, scrollLeft: container.scrollLeft, scrollTop: container.scrollTop }; }
			} else if (e.pointerType === 'mouse') {
				if (buttons & 2) { penActionRef.current = 'pan'; activePanPointerIdRef.current = e.pointerId; panState.current = { x: e.clientX, y: e.clientY, scrollLeft: container.scrollLeft, scrollTop: container.scrollTop }; }
				else if (buttons & 1) { if (tool === 'erase') { penActionRef.current = 'erase'; activeDrawPointerIdRef.current = e.pointerId; beginStroke(pos, true); } else { penActionRef.current = 'draw'; activeDrawPointerIdRef.current = e.pointerId; beginStroke(pos, false); } }
			} else if (e.pointerType === 'touch') {
				if (penActionRef.current === 'draw' || penActionRef.current === 'erase') return;
				penActionRef.current = 'pan'; activePanPointerIdRef.current = e.pointerId; panState.current = { x: e.clientX, y: e.clientY, scrollLeft: container.scrollLeft, scrollTop: container.scrollTop }; }
		};
		const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
			if (disabled) return; if (!penActionRef.current) return; const container = containerRef.current!;
			if (penActionRef.current === 'pan' && panState.current && activePanPointerIdRef.current === e.pointerId) { const dx = e.clientX - panState.current.x; const dy = e.clientY - panState.current.y; container.scrollLeft = panState.current.scrollLeft - dx; container.scrollTop = panState.current.scrollTop - dy; return; }
			if ((penActionRef.current === 'draw' || penActionRef.current === 'erase') && lastPointRef.current && activeDrawPointerIdRef.current === e.pointerId) {
				const native = e.nativeEvent as PointerEvent & { offsetX: number; offsetY: number };
				const pos = { x: native.offsetX / zoom, y: native.offsetY / zoom };
				if (penActionRef.current === 'erase') {
					const ctx = canvasRef.current?.getContext('2d');
					if (ctx) { ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0,0,0,1)'; ctx.lineWidth = brushSize; ctx.beginPath(); ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y); ctx.lineTo(pos.x, pos.y); ctx.stroke(); ctx.restore(); }
				} else drawLine(lastPointRef.current, pos);
				lastPointRef.current = pos;
			}
		};
		const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
			if (e.pointerType !== 'touch') (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);
			if (penActionRef.current === 'pan' && activePanPointerIdRef.current === e.pointerId) { panState.current = null; activePanPointerIdRef.current = null; }
			else if (penActionRef.current === 'draw' || penActionRef.current === 'erase') { if (activeDrawPointerIdRef.current === e.pointerId) { endStroke(); activeDrawPointerIdRef.current = null; } }
			if (penActionRef.current && ((penActionRef.current === 'pan' && activePanPointerIdRef.current === null) || (penActionRef.current !== 'pan' && activeDrawPointerIdRef.current === null))) penActionRef.current = null;
		};
		return (
			<div
				ref={containerRef}
				className="canvas-shell inline-block"
				style={{ width: FIXED_WIDTH * autoScale, height: FIXED_HEIGHT * autoScale }}
			>
				<div className="relative" style={{ width: FIXED_WIDTH * zoom, height: FIXED_HEIGHT * zoom }}>
					{onionImage && (
						<img src={onionImage} alt="previous frame" className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%', objectFit: 'fill', opacity: Math.max(0, Math.min(1, onionOpacity)) }} />
					)}
					<canvas
						ref={canvasRef}
						width={FIXED_WIDTH}
						height={FIXED_HEIGHT}
						className={`${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-crosshair'} absolute inset-0 canvas-paper sketch-outline select-none`}
						data-drawing={isDrawing ? 'true' : 'false'}
						style={{ width: '100%', height: '100%', touchAction: 'none' }}
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
					<div className="absolute inset-0 flex items-center justify-center bg-black/30">
						<p className="text-sm font-semibold" style={{ color: '#111' }}>Start session to draw</p>
					</div>
				)}
			</div>
		);
	}
);
