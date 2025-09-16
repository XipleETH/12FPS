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
  id: string; // unique id (could be key or generated)
  imageData: string; // public URL or data URL
  timestamp: number; // ms epoch
  artist: string; // placeholder if unknown
  paletteWeek: number;
  key?: string; // storage key (frames/...)
}

function App() {
  // Reddit-only build: always use relative /api/* endpoints served by Devvit proxy/server
  const prefixIfLocal = (url: string) => url;
  // Iframe embedding detection
  const [isEmbedded, setIsEmbedded] = useState<boolean>(() => {
    try { return typeof window !== 'undefined' && window.self !== window.top; } catch { return false; }
  });
  const [embedContext, setEmbedContext] = useState<string>('');

  useEffect(() => {
    try {
      const embedded = window.self !== window.top;
      setIsEmbedded(embedded);
      if (embedded) {
        try {
          const parentUrl = document.referrer || '';
          if (parentUrl.includes('reddit.com')) setEmbedContext('reddit'); else setEmbedContext('iframe');
        } catch { setEmbedContext('iframe'); }
      } else {
        setEmbedContext('');
      }
    } catch {}
  }, []);

  const [activeColor, setActiveColor] = useState('#FF6B6B');
  const [brushSize, setBrushSize] = useState(10);
  const [isDrawing, setIsDrawing] = useState(false);
  const [frames, setFrames] = useState<Frame[]>([]);
  // Frame temporal (solo cache local durante la sesión)
  const [pendingFrameDataUrl, setPendingFrameDataUrl] = useState<string | null>(null);
  // Shared pending frame (from server)
  const [sharedPending, setSharedPending] = useState<{ imageData: string; timestamp: number; etag?: string } | null>(null);
  // Estado para último error de subida
  // Removed upload error/debug state (no external uploads)
  const [currentView, setCurrentView] = useState<'draw' | 'gallery' | 'video' | 'voting' | 'chat'>('draw');
  const [timeLeft, setTimeLeft] = useState<number>(0); // seconds until current 2h window end
  const [sessionStartTs, setSessionStartTs] = useState<number | null>(null); // when current artist window started
  const [currentWeek] = useState(1);
  const [paletteSide, setPaletteSide] = useState<'left' | 'right'>('right');
  // Brush system disabled (presets & styles removed)
  const [panelsOrder, setPanelsOrder] = useState<PanelKey[]>(['actions','tools','brushSize','brushMode','palette']);
  const [tool, setTool] = useState<'draw' | 'erase' | 'fill'>('draw');
  const [zoom, setZoom] = useState(1);
  const [onionOpacity, setOnionOpacity] = useState(0.35);
  const canvasCardRef = useRef<HTMLDivElement | null>(null);
  // Turn-based state
  const [currentUser, setCurrentUser] = useState<string>('anonymous');
  const [turnInfo, setTurnInfo] = useState<any>(null);
  const [lobbyActionLoading, setLobbyActionLoading] = useState(false);
  // Artist readiness removed; first click claims turn
  // debugMode removed (fast forward no longer used)

  // fastForward removed
  
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
  const [draftImage, setDraftImage] = useState<string | null>(null);

  // Draft persistence (localStorage + future server/Redis hook)
  const DRAFT_KEY = '12fps:current-draft';
  useEffect(() => {
    try {
      const stored = localStorage.getItem(DRAFT_KEY);
      if (stored) setDraftImage(stored);
    } catch {}
  }, []);

  // User identity derive from ?user= or localStorage
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const qUser = params.get('user');
      const stored = localStorage.getItem('12fps:user');
      const finalUser = qUser || stored || ('user'+Math.random().toString(36).slice(2,8));
      setCurrentUser(finalUser);
      localStorage.setItem('12fps:user', finalUser);
    } catch {}
  }, []);

  // Override with Reddit username when embedded in Reddit via Devvit endpoint
  useEffect(() => {
    if (!isEmbedded || embedContext !== 'reddit') return;
    let aborted = false;
    (async () => {
      try {
  const r = await fetch('/api/whoami'); // stays relative inside reddit embed
        if (!r.ok) return;
        const j = await r.json();
        if (!aborted && j && j.username) {
          setCurrentUser(j.username);
          try { localStorage.setItem('12fps:user', j.username); } catch {}
        }
      } catch {}
    })();
    return () => { aborted = true; };
  }, [isEmbedded, embedContext]);

  // Poll turn info every 15s
  useEffect(() => {
    let id: number | null = null;
    const fetchTurn = async () => {
      try {
  const r = await fetch(prefixIfLocal('/api/turn'));
        if(!r.ok) return;
        const j = await r.json();
        setTurnInfo(j);
      } catch {}
    };
    fetchTurn();
    id = window.setInterval(fetchTurn, 15000);
    return () => { if(id) window.clearInterval(id); };
  }, []);

  // Track artist window start timestamp
  useEffect(() => {
    if (!turnInfo) return;
    if (turnInfo.currentArtist) {
      setSessionStartTs(turnInfo.windowStart);
    }
  }, [turnInfo?.currentArtist, turnInfo?.windowStart]);

  const persistDraft = useCallback(() => {
    if (!canvasRef.current) return;
    try {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      localStorage.setItem(DRAFT_KEY, dataUrl);
      setDraftImage(dataUrl);
      // TODO: Optional: throttle + POST to a Devvit server endpoint to store in Redis for cross-device continuity.
    } catch {}
  }, []);

  // Countdown robust: use server windowEnd/timeToEndSeconds; correct drift periodically
  const countdownRef = useRef<{ targetMs: number; lastServerSync: number; lastDisplayed: number }>({ targetMs: 0, lastServerSync: 0, lastDisplayed: 0 });
  useEffect(() => {
    if (!turnInfo) return;
    const now = Date.now();
    let target = 0;
    if (typeof turnInfo.windowEnd === 'number') {
      target = turnInfo.windowEnd;
    } else if (typeof turnInfo.timeToEndSeconds === 'number') {
      target = now + turnInfo.timeToEndSeconds * 1000;
    }
    if (target > 0) {
      countdownRef.current.targetMs = target;
      countdownRef.current.lastServerSync = now;
    }
  }, [turnInfo?.windowEnd, turnInfo?.timeToEndSeconds]);

  useEffect(() => {
    const tick = () => {
      const { targetMs } = countdownRef.current;
      if (!targetMs) {
        setTimeLeft(0);
        return;
      }
      const now = Date.now();
      let sec = Math.floor((targetMs - now) / 1000);
      if (sec < 0) sec = 0;
      // Drift correction: if local differs from server implied (turnInfo.timeToEndSeconds) by >5s right after sync window, rely on new sync
      setTimeLeft(sec);
      countdownRef.current.lastDisplayed = now;
    };
    const id = window.setInterval(tick, 1000);
    tick();
    return () => window.clearInterval(id);
  }, []);

  // Sube un dataURL al backend (con soporte interno Reddit /r2/upload-frame)
  // Removed legacy uploadDataUrlPNG (external uploads disabled).

  // Guardar dentro de la sesión: solo cache local, no subir
  const saveFrame = useCallback(() => {
    // Only artist can save
  if (!canvasRef.current || !(turnInfo && turnInfo.currentArtist === currentUser)) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    setPendingFrameDataUrl(dataUrl);
  // Clearing draft after an intentional save (we treat this as commit-in-progress but keep local draft in case finalize fails)
  persistDraft();
    // Fire-and-forget upload to shared pending endpoint
    (async () => {
      try {
  await fetch(prefixIfLocal('/api/pending-frame'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl }) });
      } catch {}
    })();
  }, [turnInfo, currentUser, persistDraft]);

  // Al finalizar la sesión se sube la última imagen cacheada
  // finalizingRef removed with legacy finalize code.
  // Removed legacy finalizeSessionUpload (external upload disabled). ForceEndSession now handles finalize.

  const forceEndSession = useCallback(() => {
    if (!(turnInfo && turnInfo.currentArtist === currentUser)) return;
    (async () => {
      try {
        // Capture current canvas into pending-frame first
        if (canvasRef.current) {
          try {
            const dataUrl = canvasRef.current.toDataURL('image/png');
            await fetch('/api/pending-frame', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl }) });
          } catch {}
        }
        await fetch('/api/finalize-turn', { method: 'POST' });
        const r = await fetch('/api/turn');
        if (r.ok) setTurnInfo(await r.json());
  // Clear local pending caches
  setPendingFrameDataUrl(null);
  setSharedPending(null);
        // Reload frames list to include newly finalized frame
        const lf = await fetch('/api/list-frames');
        if (lf.ok) {
          const data = await lf.json();
          if (Array.isArray(data.frames)) {
            const loaded: Frame[] = data.frames.map((o: any) => ({
              id: o.key || o.id || Math.random().toString(36).slice(2),
              key: o.key,
              imageData: o.url,
              timestamp: o.lastModified || Date.now(),
              artist: o.artist || 'anonymous',
              paletteWeek: currentWeek
            }));
            setFrames(loaded);
          }
        }
      } catch {}
    })();
  }, [turnInfo, currentUser, currentWeek]);

  // Poll shared pending frame every 10s when drawing or viewing gallery
  useEffect(() => {
    let interval: number | null = null;
    const active = currentView === 'draw' || currentView === 'gallery';
    if (active) {
      const fetchPending = async () => {
        try {
          const r = await fetch(prefixIfLocal('/api/pending-frame'));
          if (!r.ok) return;
          const j = await r.json();
          if (j && j.pending && j.pending.url) {
            const cacheBuster = j.pending.etag || j.pending.lastModified || Date.now();
            const bustedUrl = j.pending.url + (j.pending.url.includes('?') ? '&' : '?') + 'v=' + cacheBuster;
            setSharedPending(prev => {
              if (prev && prev.etag === j.pending.etag) return prev; // unchanged
              return { imageData: bustedUrl, timestamp: j.pending.lastModified || Date.now(), etag: j.pending.etag };
            });
          } else {
            setSharedPending(null);
          }
        } catch {}
      };
      fetchPending();
      interval = window.setInterval(fetchPending, 10000);
    }
    return () => { if (interval) window.clearInterval(interval); };
  }, [currentView]);

  // Auto finalize when window ends and we were the artist
  const prevArtistRef = useRef<string | null>(null);
  useEffect(() => {
    if (!turnInfo) return;
    if (prevArtistRef.current && prevArtistRef.current === currentUser && prevArtistRef.current !== turnInfo.currentArtist) {
      // Artist switched; ensure any pending frame is finalized via server finalize endpoint
      forceEndSession();
    }
    prevArtistRef.current = turnInfo.currentArtist;
  }, [turnInfo?.currentArtist, forceEndSession, currentUser]);

  useEffect(() => {
    if (timeLeft === 0 && turnInfo && turnInfo.currentArtist) {
      // Auto finalize once when window hits zero by current artist (best-effort)
      if (turnInfo.currentArtist === currentUser) {
        forceEndSession();
      }
    }
  }, [timeLeft, turnInfo?.currentArtist, currentUser, forceEndSession]);

  // Cargar frames existentes desde el backend (R2 listing)
  useEffect(() => {
    (async () => {
      try {
    const resp = await fetch(prefixIfLocal('/api/list-frames'));
        if (!resp.ok) return;
        const data = await resp.json();
        if (Array.isArray(data.frames)) {
          const loaded: Frame[] = data.frames.map((o: any) => ({
            id: o.key || o.id || o.key || Math.random().toString(36).slice(2),
            key: o.key,
            imageData: o.url,
            timestamp: o.lastModified || Date.now(),
            artist: o.artist || 'anonymous',
            paletteWeek: currentWeek
          }));
          setFrames(loaded);
        }
      } catch (e) {
        // silent
      }
    })();
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
    <div className={`min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 ${isEmbedded ? 'embedded-mode' : ''}`}>
      {/* Embedding indicator for Reddit */}
      {isEmbedded && embedContext === 'reddit' && (
        <div className="bg-orange-500/90 text-white text-xs px-3 py-1 text-center font-medium">
          🎨 Running in Reddit • Full experience at 12-fps.vercel.app
        </div>
      )}
      
  <Header currentView={currentView} setCurrentView={setCurrentView} />
  <div className="max-w-6xl mx-auto px-3 pb-4">
        {/* Turn / Lobby banner */}
        {turnInfo && (
          <div className="mb-4 text-xs text-white/80 bg-white/10 border border-white/20 rounded-lg p-3 flex flex-wrap gap-4 items-center">
            <div><span className="font-semibold">User:</span> {currentUser}</div>
            <div><span className="font-semibold">Artist:</span> {turnInfo.currentArtist || '—'}</div>
            <div><span className="font-semibold">Ends in:</span> {new Date(timeLeft * 1000).toISOString().substring(11,19)}</div>
            {!turnInfo.currentArtist && timeLeft > 0 && (
              <button disabled={lobbyActionLoading} onClick={async ()=>{ setLobbyActionLoading(true); try { await fetch('/api/turn',{ method:'POST'}); const r= await fetch('/api/turn'); if(r.ok) setTurnInfo(await r.json()); } finally { setLobbyActionLoading(false);} }} className="px-3 py-1 bg-emerald-600/80 hover:bg-emerald-600 text-white rounded-md text-xs font-semibold shadow">Start Turn</button>
            )}
            {turnInfo.currentArtist === currentUser && (
              <button onClick={forceEndSession} className="px-2 py-1 bg-red-600/70 hover:bg-red-600 text-white rounded text-xs">Finalize (debug)</button>
            )}
          </div>
        )}
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
              disabled={!(turnInfo && turnInfo.currentArtist === currentUser) || timeLeft === 0}
              timeLeft={timeLeft}
              lobbyToggleButton={null}
              artistActionButton={null}
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
                    disabled={!(turnInfo && turnInfo.currentArtist === currentUser) || timeLeft === 0}
                    brushMode={'solid'}
                    brushPreset={undefined}
                    tool={tool}
                    onBeforeMutate={snapshotCanvas}
                    zoom={zoom}
                    onionImage={frames.length ? frames[frames.length-1].imageData : undefined}
                    onionOpacity={onionOpacity}
                    onDirty={persistDraft}
                    restoreImage={draftImage}
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
            pendingFrame={(pendingFrameDataUrl || sharedPending) ? { imageData: pendingFrameDataUrl || sharedPending!.imageData, startedAt: sessionStartTs || sharedPending?.timestamp || Date.now() } : null}
          />
        )}
  {/* Upload debug panels removed */}

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