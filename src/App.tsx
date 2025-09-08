import { useState, useRef, useEffect, useCallback } from 'react';
import { Canvas } from './components/Canvas';
// import { ColorPalette } from './components/ColorPalette';
import { SidePanels, PanelKey } from './components/SidePanels';
import { Timer } from './components/Timer';
import { FrameGallery } from './components/FrameGallery';
import { VideoPlayer } from './components/VideoPlayer';
import { PaletteVoting } from './components/PaletteVoting';
// Header removed: navigation moved into SidePanels
import { ZoomIn, ZoomOut, Layers } from 'lucide-react';
import { brushKits, BrushStyle, BrushPreset } from './brushes';

export interface Frame {
  id: string;
  imageData: string;
  timestamp: number;
  artist: string;
  paletteWeek: number;
}

function App() {
  const [activeColor, setActiveColor] = useState('#FF6B6B');
  const [brushSize, setBrushSize] = useState(10);
  const [isDrawing, setIsDrawing] = useState(false);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [currentView, setCurrentView] = useState<'draw' | 'gallery' | 'video' | 'voting' | 'chat'>('draw');
  const [timeLeft, setTimeLeft] = useState(7200); // 2 hours in seconds
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [currentWeek] = useState(1);
  const [paletteSide, setPaletteSide] = useState<'left' | 'right'>('right');
  const [brushMode, setBrushMode] = useState<'solid' | 'soft' | 'fade' | 'spray'>('solid');
  const [brushStyle, setBrushStyle] = useState<BrushStyle>('anime');
  const [brushPresetId, setBrushPresetId] = useState<string>('');
  const [panelsOrder, setPanelsOrder] = useState<PanelKey[]>(['navigation','actions','tools','brushSize','brushMode','palette']);
  const [tool, setTool] = useState<'draw' | 'erase' | 'fill'>('draw');
  const [zoom, setZoom] = useState(1);
  const [onionOpacity, setOnionOpacity] = useState(0.35);
  const canvasCardRef = useRef<HTMLDivElement | null>(null);
  
  // Weekly palette - changes every week
  const weeklyPalettes = [
    ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'],
    ['#E17055', '#FDCB6E', '#6C5CE7', '#A29BFE', '#FD79A8', '#E84393'],
    ['#00CEC9', '#55A3FF', '#FDCB6E', '#E17055', '#A29BFE', '#FD79A8']
  ];
  
  const currentPalette = weeklyPalettes[currentWeek % weeklyPalettes.length];
  const currentPreset: BrushPreset | undefined =
    brushKits[brushStyle]?.find(b => b.id === brushPresetId) || undefined;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [undoStack, setUndoStack] = useState<ImageData[]>([]);

  // Timer logic
  useEffect(() => {
  let interval: number;
    if (isSessionActive && timeLeft > 0) {
  interval = window.setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            setIsSessionActive(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
  return () => window.clearInterval(interval);
  }, [isSessionActive, timeLeft]);

  const startSession = () => {
    setIsSessionActive(true);
    setTimeLeft(7200);
  };

  async function uploadCanvasPNG(): Promise<{ url: string; key?: string } | null> {
    if (!canvasRef.current) return null;
    const canvas = canvasRef.current;
    // Convert to Blob for upload
    const blob: Blob = await new Promise((resolve) => canvas.toBlob(b => resolve(b as Blob), 'image/png'));
    try {
      const resp = await fetch('/api/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: 'image/png', ext: 'png', prefix: 'frames' })
      });
      if (!resp.ok) throw new Error('Failed to get signed URL');
      const { signedUrl, publicUrl, key } = await resp.json();
      const put = await fetch(signedUrl, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: blob });
      if (!put.ok) throw new Error('Upload failed');
      return { url: publicUrl || signedUrl.split('?')[0], key };
    } catch (e) {
      // Fallback: embed data URL locally
      const dataUrl = canvas.toDataURL('image/png');
      return { url: dataUrl };
    }
  }

  const saveFrame = useCallback(async () => {
    const uploaded = await uploadCanvasPNG();
    if (!uploaded) return;
    const newFrame: Frame = {
      id: Date.now().toString(),
      imageData: uploaded.url,
      timestamp: Date.now(),
      artist: `Artist ${Math.floor(Math.random() * 100)}`,
      paletteWeek: currentWeek
    };
    setFrames(prev => [...prev, newFrame]);
  }, [currentWeek]);

  const clearCanvas = () => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
  // Reset transform to clear in device pixels, then restore
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  // Repaint solid white background so repeated cleans keep a white canvas
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  ctx.restore();
    }
  };

  const snapshotCanvas = () => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const img = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
    setUndoStack(prev => {
      const next = prev.slice(-24); // cap to last 25 snapshots
      next.push(img);
      return next;
    });
  };

  const undo = () => {
    if (!canvasRef.current || undoStack.length === 0) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack(undoStack.slice(0, -1));
    ctx.putImageData(prev, 0, 0);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900">
  {/* Navigation is now inside SidePanels */}
  <div className="max-w-6xl mx-auto px-3 py-4">
        {currentView === 'draw' && (
          <div className={`w-full flex justify-center gap-6 ${paletteSide === 'left' ? 'flex-row' : 'flex-row-reverse'}`}>
            <SidePanels
              side={paletteSide}
              toggleSide={() => setPaletteSide(p => p === 'right' ? 'left' : 'right')}
              order={panelsOrder}
              setOrder={setPanelsOrder}
              currentView={currentView}
              setCurrentView={setCurrentView}
              tool={tool}
              setTool={setTool}
              brushSize={brushSize}
              setBrushSize={setBrushSize}
              setBrushMode={setBrushMode}
              brushStyle={brushStyle}
              setBrushStyle={setBrushStyle}
              brushPresetId={brushPresetId}
              setBrushPresetId={(id) => setBrushPresetId(id)}
              colors={currentPalette}
              activeColor={activeColor}
              setActiveColor={setActiveColor}
              currentWeek={currentWeek}
              onSave={saveFrame}
              onClear={clearCanvas}
              onUndo={undo}
              disabled={!isSessionActive || timeLeft === 0}
            />
            <div ref={canvasCardRef} className="space-y-2">
              <div className="flex justify-between items-center px-0.5">
                <h2 className="text-xl font-semibold text-white tracking-tight">Canvas</h2>
              </div>
              <div className="flex items-start gap-4">
        {paletteSide === 'right' && (
                  <div className="flex flex-col gap-2 pt-2">
                    <div className="bg-white/12 backdrop-blur-xl border border-white/20 rounded-2xl p-3 flex flex-col items-center gap-3 shadow-md select-none">
                      <Timer timeLeft={timeLeft} isActive={isSessionActive} onStart={startSession} compact orientation="vertical" showProgress={false} />
                      <div className="flex flex-col items-center gap-1">
                        <ZoomIn className="w-4 h-4 text-white/70" />
                        <input
                          type="range"
                          min={100}
                          max={400}
                          value={zoom*100}
                          onChange={(e) => setZoom(parseInt(e.target.value,10)/100)}
                          aria-label="Zoom level"
                          className="h-36 accent-white/80 cursor-pointer rotate-180"
                          style={{ writingMode: 'vertical-rl' as any }}
                        />
                        <ZoomOut className="w-4 h-4 text-white/70" />
                      </div>
                      {/* Reset button removed to avoid layout shift when zoom != 1 */}
                      <div className="flex flex-col items-center gap-1">
                        <Layers className="w-4 h-4 text-white/70" />
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={Math.round(onionOpacity*100)}
                          onChange={(e) => setOnionOpacity(parseInt(e.target.value,10)/100)}
                          aria-label="Onion opacity"
                          className="h-28 accent-white/70 cursor-pointer rotate-180"
                          style={{ writingMode: 'vertical-rl' as any }}
                        />
                      </div>
                    </div>
                  </div>
                )}
                <div className="inline-block rounded-xl border border-white/20 bg-white/10 backdrop-blur-sm" style={{ width: 540, height: 960 }}>
                  <Canvas
                    ref={canvasRef}
                    activeColor={activeColor}
                    brushSize={brushSize}
                    isDrawing={isDrawing}
                    setIsDrawing={setIsDrawing}
                    disabled={!isSessionActive || timeLeft === 0}
                    brushMode={brushMode}
                    brushPreset={currentPreset}
                    tool={tool}
                    onBeforeMutate={snapshotCanvas}
                    zoom={zoom}
                    onionImage={frames.length ? frames[frames.length-1].imageData : undefined}
                    onionOpacity={onionOpacity}
                  />
                </div>
        {paletteSide === 'left' && (
                  <div className="flex flex-col gap-2 pt-2">
                    <div className="bg-white/12 backdrop-blur-xl border border-white/20 rounded-2xl p-3 flex flex-col items-center gap-3 shadow-md select-none">
                      <Timer timeLeft={timeLeft} isActive={isSessionActive} onStart={startSession} compact orientation="vertical" showProgress={false} />
                      <div className="flex flex-col items-center gap-1">
                        <ZoomIn className="w-4 h-4 text-white/70" />
                        <input
                          type="range"
                          min={100}
                          max={400}
                          value={zoom*100}
                          onChange={(e) => setZoom(parseInt(e.target.value,10)/100)}
                          aria-label="Zoom level"
                          className="h-36 accent-white/80 cursor-pointer rotate-180"
                          style={{ writingMode: 'vertical-rl' as any }}
                        />
                        <ZoomOut className="w-4 h-4 text-white/70" />
                      </div>
                      {/* Reset button removed to avoid layout shift when zoom != 1 */}
                      <div className="flex flex-col items-center gap-1">
                        <Layers className="w-4 h-4 text-white/70" />
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={Math.round(onionOpacity*100)}
                          onChange={(e) => setOnionOpacity(parseInt(e.target.value,10)/100)}
                          aria-label="Onion opacity"
                          className="h-28 accent-white/70 cursor-pointer rotate-180"
                          style={{ writingMode: 'vertical-rl' as any }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {currentView === 'gallery' && (
          <FrameGallery frames={frames} />
        )}

        {currentView === 'video' && (
          <VideoPlayer frames={frames} />
        )}

        {currentView === 'voting' && (
          <PaletteVoting />
        )}

        {currentView === 'chat' && (
          <div className="max-w-3xl mx-auto text-white/80 text-sm bg-white/10 border border-white/20 rounded-xl p-4">
            Chat is coming soon. For now, use Gallery, Video, or Vote.
          </div>
        )}
      </div>
    </div>
  );
}

export default App;