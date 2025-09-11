import { useState, useRef, useEffect, useCallback } from 'react';
import { Canvas } from './components/Canvas';
// import { ColorPalette } from './components/ColorPalette';
import { SidePanels, PanelKey } from './components/SidePanels';
import { Header } from './components/Header';
import { FrameGallery } from './components/FrameGallery';
import { VideoPlayer } from './components/VideoPlayer';
import { PaletteVoting } from './components/PaletteVoting';
// Header removed: navigation moved into SidePanels
import { ZoomIn, ZoomOut, Layers } from 'lucide-react';
// Brush presets removed; no brush imports needed

export interface Frame {
  id: string;
  imageData: string;
  timestamp: number;
  artist: string;
  paletteWeek: number;
}

function App() {
  // Iframe embedding detection
  const [isEmbedded, setIsEmbedded] = useState(false);
  const [embedContext, setEmbedContext] = useState<string>('');

  useEffect(() => {
    try {
      const embedded = window.self !== window.top;
      setIsEmbedded(embedded);
      
      if (embedded) {
        // Try to detect the parent origin for context
        try {
          const parentUrl = document.referrer || 'unknown';
          if (parentUrl.includes('reddit.com')) {
            setEmbedContext('reddit');
          } else {
            setEmbedContext('iframe');
          }
        } catch (e) {
          setEmbedContext('iframe');
        }
      }
    } catch (e) {
      // Fallback if iframe detection fails
      setIsEmbedded(false);
    }
  }, []);

  const [activeColor, setActiveColor] = useState('#FF6B6B');
  const [brushSize, setBrushSize] = useState(10);
  const [isDrawing, setIsDrawing] = useState(false);
  const [frames, setFrames] = useState<Frame[]>([]);
  // Frame temporal (solo cache local durante la sesión)
  const [pendingFrameDataUrl, setPendingFrameDataUrl] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'draw' | 'gallery' | 'video' | 'voting' | 'chat'>('draw');
  const [timeLeft, setTimeLeft] = useState(7200); // 2 hours in seconds
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [sessionStartTs, setSessionStartTs] = useState<number | null>(null);
  const [currentWeek] = useState(1);
  const [paletteSide, setPaletteSide] = useState<'left' | 'right'>('right');
  // Brush system disabled (presets & styles removed)
  const [panelsOrder, setPanelsOrder] = useState<PanelKey[]>(['actions','tools','brushSize','brushMode','palette']);
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
  // No currentPreset while brushes are disabled

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
    setPendingFrameDataUrl(null);
  setSessionStartTs(Date.now());
  };

  // Sube un dataURL al backend (solo cuando termina la sesión)
  async function uploadDataUrlPNG(dataUrl: string): Promise<{ url: string; key?: string } | null> {
    // Convert dataURL to Blob
    try {
      const parts = dataUrl.split(',');
      const base64 = parts[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'image/png' });
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
        return { url: dataUrl };
      }
    } catch {
      return null;
    }
  }

  // Guardar dentro de la sesión: solo cache local, no subir
  const saveFrame = useCallback(() => {
    if (!canvasRef.current || !isSessionActive) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    setPendingFrameDataUrl(dataUrl);
  }, [isSessionActive]);

  // Al finalizar la sesión se sube la última imagen cacheada
  const finalizeSessionUpload = useCallback(async () => {
    if (!pendingFrameDataUrl) return;
    const uploaded = await uploadDataUrlPNG(pendingFrameDataUrl);
    if (!uploaded) return;
    const newFrame: Frame = {
      id: Date.now().toString(),
      imageData: uploaded.url,
      timestamp: Date.now(),
      artist: `Artist ${Math.floor(Math.random() * 100)}`,
      paletteWeek: currentWeek
    };
    setFrames(prev => [...prev, newFrame]);
    setPendingFrameDataUrl(null);
  }, [pendingFrameDataUrl, currentWeek]);

  const forceEndSession = useCallback(() => {
    if (!isSessionActive) return;
    setIsSessionActive(false);
    setTimeLeft(0);
    // finalizeSessionUpload will run via effect OR call directly for immediacy
    finalizeSessionUpload();
  }, [isSessionActive, finalizeSessionUpload]);

  // Detectar fin de sesión (timer llega a 0)
  const prevIsActiveRef = useRef(isSessionActive);
  useEffect(() => {
    if (prevIsActiveRef.current && !isSessionActive && timeLeft === 0) {
      finalizeSessionUpload();
    }
    prevIsActiveRef.current = isSessionActive;
  }, [isSessionActive, timeLeft, finalizeSessionUpload]);

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
    <div className={`min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 ${isEmbedded ? 'embedded-mode' : ''}`}>
      {/* Embedding indicator for Reddit */}
      {isEmbedded && embedContext === 'reddit' && (
        <div className="bg-orange-500/90 text-white text-xs px-3 py-1 text-center font-medium">
          🎨 Running in Reddit • Full experience at 12-fps.vercel.app
        </div>
      )}
      
  <Header currentView={currentView} setCurrentView={setCurrentView} />
  <div className="max-w-6xl mx-auto px-3 pb-4">
        {currentView === 'draw' && (
          <div className={`w-full flex justify-center gap-6 ${paletteSide === 'left' ? 'flex-row' : 'flex-row-reverse'}`}>
            <SidePanels
              side={paletteSide}
              toggleSide={() => setPaletteSide(p => p === 'right' ? 'left' : 'right')}
              order={panelsOrder}
              setOrder={setPanelsOrder}
              tool={tool}
              setTool={setTool}
              brushSize={brushSize}
              setBrushSize={setBrushSize}
              colors={currentPalette}
              activeColor={activeColor}
              setActiveColor={setActiveColor}
              currentWeek={currentWeek}
              onSave={saveFrame}
              onClear={clearCanvas}
              onUndo={undo}
              disabled={!isSessionActive || timeLeft === 0}
              timeLeft={timeLeft}
              isSessionActive={isSessionActive}
              onStartSession={startSession}
              onForceEnd={forceEndSession}
            />
            <div ref={canvasCardRef}>
              <div className="flex items-start gap-4">
                {paletteSide === 'right' && (
                  <div className="flex flex-col gap-2 pt-2">
                    <div className="bg-white/12 backdrop-blur-xl border border-white/20 rounded-2xl p-3 flex flex-col items-center gap-3 shadow-md select-none">
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
                <div className="inline-block">
                  <Canvas
                    ref={canvasRef}
                    activeColor={activeColor}
                    brushSize={brushSize}
                    isDrawing={isDrawing}
                    setIsDrawing={setIsDrawing}
                    disabled={!isSessionActive || timeLeft === 0}
                    brushMode={'solid'}
                    brushPreset={undefined}
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
          <FrameGallery
            frames={frames}
            pendingFrame={pendingFrameDataUrl ? { imageData: pendingFrameDataUrl, startedAt: sessionStartTs || Date.now() } : null}
          />
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