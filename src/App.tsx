import { useState, useRef, useEffect, useCallback } from 'react';
import { Canvas } from './components/Canvas';
// import { ColorPalette } from './components/ColorPalette';
import { SidePanels, PanelKey } from './components/SidePanels';
import { Timer } from './components/Timer';
import { FrameGallery } from './components/FrameGallery';
import { VideoPlayer } from './components/VideoPlayer';
import { PaletteVoting } from './components/PaletteVoting';
import { Header } from './components/Header';
import { RotateCcw } from 'lucide-react';

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
  const [currentView, setCurrentView] = useState<'draw' | 'gallery' | 'video' | 'voting'>('draw');
  const [timeLeft, setTimeLeft] = useState(7200); // 2 hours in seconds
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [currentWeek] = useState(1);
  const [paletteSide, setPaletteSide] = useState<'left' | 'right'>('right');
  const [brushMode, setBrushMode] = useState<'solid' | 'soft' | 'fade' | 'spray'>('solid');
  const [panelsOrder, setPanelsOrder] = useState<PanelKey[]>(['actions','brushSize','brushMode','palette']);
  const [zoom, setZoom] = useState(1);
  const canvasCardRef = useRef<HTMLDivElement | null>(null);
  
  // Weekly palette - changes every week
  const weeklyPalettes = [
    ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'],
    ['#E17055', '#FDCB6E', '#6C5CE7', '#A29BFE', '#FD79A8', '#E84393', '#00B894'],
    ['#00CEC9', '#55A3FF', '#FDCB6E', '#E17055', '#A29BFE', '#FD79A8', '#00B894']
  ];
  
  const currentPalette = weeklyPalettes[currentWeek % weeklyPalettes.length];

  const canvasRef = useRef<HTMLCanvasElement>(null);

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

  const saveFrame = useCallback(() => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const imageData = canvas.toDataURL('image/png');
    
    const newFrame: Frame = {
      id: Date.now().toString(),
      imageData,
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
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900">
      <Header currentView={currentView} setCurrentView={setCurrentView} />
      
  <div className="max-w-6xl mx-auto px-3 py-4">
        {currentView === 'draw' && (
          <div className={`w-full flex justify-center gap-6 ${paletteSide === 'left' ? 'flex-row' : 'flex-row-reverse'}`}>
            <SidePanels
              side={paletteSide}
              toggleSide={() => setPaletteSide(p => p === 'right' ? 'left' : 'right')}
              order={panelsOrder}
              setOrder={setPanelsOrder}
              brushSize={brushSize}
              setBrushSize={setBrushSize}
              brushMode={brushMode}
              setBrushMode={setBrushMode}
              colors={currentPalette}
              activeColor={activeColor}
              setActiveColor={setActiveColor}
              currentWeek={currentWeek}
              onSave={saveFrame}
              onClear={clearCanvas}
              disabled={!isSessionActive || timeLeft === 0}
            />
            <div ref={canvasCardRef} className="space-y-2">
              <div className="flex justify-between items-center px-0.5">
                <h2 className="text-xl font-semibold text-white tracking-tight">Canvas</h2>
                <Timer 
                  timeLeft={timeLeft}
                  isActive={isSessionActive}
                  onStart={startSession}
                />
              </div>
              <div className="flex items-start gap-4">
                {paletteSide === 'right' && (
                  <div className="flex flex-col gap-2 pt-2">
                    <div className="bg-white/12 backdrop-blur-xl border border-white/20 rounded-2xl p-3 flex flex-col items-center gap-3 shadow-md select-none">
                      <button
                        onClick={() => setZoom(z => Math.min(4, parseFloat((z + 0.25).toFixed(2))))}
                        disabled={zoom >= 4}
                        aria-label="Zoom in"
                        className="w-9 h-9 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 text-white text-lg font-bold disabled:opacity-30"
                      >+
                      </button>
                      <button
                        onClick={() => setZoom(z => Math.max(1, parseFloat((z - 0.25).toFixed(2))))}
                        disabled={zoom <= 1}
                        aria-label="Zoom out"
                        className="w-9 h-9 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 text-white text-lg font-bold disabled:opacity-30"
                      >-
                      </button>
                      <div className="flex flex-col items-center gap-2">
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
                      </div>
                      {zoom !== 1 && (
                        <button
                          onClick={() => setZoom(1)}
                          aria-label="Reset zoom"
                          className="w-8 h-8 flex items-center justify-center rounded-md bg-white/15 hover:bg-white/30 text-white"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
                <div className="inline-block rounded-xl border border-white/20 bg-white/10 backdrop-blur-sm" style={{ width: 960, height: 600 }}>
                  <Canvas
                    ref={canvasRef}
                    activeColor={activeColor}
                    brushSize={brushSize}
                    isDrawing={isDrawing}
                    setIsDrawing={setIsDrawing}
                    disabled={!isSessionActive || timeLeft === 0}
                    brushMode={brushMode}
                    zoom={zoom}
                    onZoomChange={setZoom}
                  />
                </div>
                {paletteSide === 'left' && (
                  <div className="flex flex-col gap-2 pt-2">
                    <div className="bg-white/12 backdrop-blur-xl border border-white/20 rounded-2xl p-3 flex flex-col items-center gap-3 shadow-md select-none">
                      <button
                        onClick={() => setZoom(z => Math.min(4, parseFloat((z + 0.25).toFixed(2))))}
                        disabled={zoom >= 4}
                        aria-label="Zoom in"
                        className="w-9 h-9 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 text-white text-lg font-bold disabled:opacity-30"
                      >+
                      </button>
                      <button
                        onClick={() => setZoom(z => Math.max(1, parseFloat((z - 0.25).toFixed(2))))}
                        disabled={zoom <= 1}
                        aria-label="Zoom out"
                        className="w-9 h-9 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 text-white text-lg font-bold disabled:opacity-30"
                      >-
                      </button>
                      <div className="flex flex-col items-center gap-2">
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
                      </div>
                      {zoom !== 1 && (
                        <button
                          onClick={() => setZoom(1)}
                          aria-label="Reset zoom"
                          className="w-8 h-8 flex items-center justify-center rounded-md bg-white/15 hover:bg-white/30 text-white"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
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
          <PaletteVoting 
            weeklyPalettes={weeklyPalettes}
            currentWeek={currentWeek}
          />
        )}
      </div>
    </div>
  );
}

export default App;