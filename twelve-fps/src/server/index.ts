import express from 'express';
import { InitResponse, IncrementResponse, DecrementResponse } from '../shared/types/api';
// Import redis + reddit + server helpers from web bundle, but context now comes from '@devvit/server'
import { redis, reddit, createServer, getServerPort } from '@devvit/web/server';
import { context } from '@devvit/server';
import { createPost } from './core/post';
import crypto from 'node:crypto';

const app = express();

// Middleware for JSON body parsing (increase limit for base64 PNG data URLs)
app.use(express.json({ limit: '3mb' }));
// Middleware for URL-encoded body parsing
app.use(express.urlencoded({ extended: true }));
// Middleware for plain text body parsing
app.use(express.text());

// --- Weekly cycle utilities ---
const WEEK_BASE_EPOCH = Date.UTC(2025,0,5,5,1,0,0); // 2025-01-05 00:01 ET approx
const WEEK_MS = 7*24*60*60*1000;
const CURRENT_WEEK_KEY = 'week:current:number';
const WEEK_PROPOSALS_KEY = (postId:string, w:number)=>`proposals:${postId}:week:${w}`;
const WEEK_WINNERS_KEY = (postId:string, w:number)=>`week:winners:${postId}:${w}`;
function getWeekNumber(now=Date.now()){ if(now < WEEK_BASE_EPOCH) return 1; return Math.floor((now-WEEK_BASE_EPOCH)/WEEK_MS)+1; }
function getWeekBoundaries(week:number){ const startMs = WEEK_BASE_EPOCH + (week-1)*WEEK_MS; return { startMs, endMs: startMs + WEEK_MS - 1 }; }
function pickWinner<T extends { votes:number; proposedAt:number }>(items:T[]):T|undefined { return items.reduce((b,i)=>{ if(!b) return i; if(i.votes>b.votes) return i; if(i.votes===b.votes && i.proposedAt < b.proposedAt) return i; return b; }, undefined as T|undefined); }
async function ensureCurrentWeek():Promise<number>{ const v = await redis.get(CURRENT_WEEK_KEY); if(v) return parseInt(v); const n = getWeekNumber(); await redis.set(CURRENT_WEEK_KEY, n.toString()); return n; }

const router = express.Router();

router.get<{ postId: string }, InitResponse | { status: string; message: string }>(
  '/api/init',
  async (_req, res): Promise<void> => {
    const { postId } = context;
    if (!postId) {
      console.error('API Init Error: postId not found in devvit context');
      res.status(400).json({ status: 'error', message: 'postId is required but missing from context' });
      return;
    }

    try {
      const [count, username] = await Promise.all([
        redis.get('count'),
        reddit.getCurrentUsername(),
      ]);

      res.json({
        type: 'init',
        postId: postId,
        count: count ? parseInt(count) : 0,
        username: username ?? 'anonymous',
      });
    } catch (error) {
      console.error(`API Init Error for post ${postId}:`, error);
      let errorMessage = 'Unknown error during initialization';
      if (error instanceof Error) {
        errorMessage = `Initialization failed: ${error.message}`;
      }
      res.status(400).json({ status: 'error', message: errorMessage });
    }
  }
);

router.post<{ postId: string }, IncrementResponse | { status: string; message: string }, unknown>(
  '/api/increment',
  async (_req, res): Promise<void> => {
    const { postId } = context;
    if (!postId) {
      res.status(400).json({ status: 'error', message: 'postId is required' });
      return;
    }
    res.json({ count: await redis.incrBy('count', 1), postId, type: 'increment' });
  }
);

router.post<{ postId: string }, DecrementResponse | { status: string; message: string }, unknown>(
  '/api/decrement',
  async (_req, res): Promise<void> => {
    const { postId } = context;
    if (!postId) {
      res.status(400).json({
        status: 'error',
        message: 'postId is required',
      });
      return;
    }

    res.json({
      count: await redis.incrBy('count', -1),
      postId,
      type: 'decrement',
    });
  }
);

router.post('/internal/on-app-install', async (_req, res): Promise<void> => {
  try {
    const post = await createPost();

    res.json({
      status: 'success',
      message: `Post created in subreddit ${context.subredditName} with id ${post.id}`,
    });
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    res.status(400).json({
      status: 'error',
      message: 'Failed to create post',
    });
  }
});

router.post('/internal/menu/post-create', async (_req, res): Promise<void> => {
  try {
    const post = await createPost();

    res.json({
      navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`,
    });
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    res.status(400).json({
      status: 'error',
      message: 'Failed to create post',
    });
  }
});

// --- Simple 2h window turn system (local Reddit-only) ---
interface TurnState {
  currentArtist: string | null;
  windowStart: number; // ms
  windowEnd: number;   // ms
  started: boolean;
  pendingFrame?: { dataUrl: string; updated: number } | null;
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const TURN_KEY = 'turn:current';

async function loadTurn(): Promise<TurnState> {
  const raw = await redis.get(TURN_KEY);
  const now = Date.now();
  if (raw) {
    try {
      const parsed: TurnState = JSON.parse(raw);
      // Reset window if expired
      if (now >= parsed.windowEnd) {
        return await resetTurnWindow();
      }
      return parsed;
    } catch {
      return await resetTurnWindow();
    }
  }
  return await resetTurnWindow();
}

async function resetTurnWindow(): Promise<TurnState> {
  const now = Date.now();
  const start = now; // start immediately when reset
  const end = start + TWO_HOURS_MS;
  const state: TurnState = { currentArtist: null, windowStart: start, windowEnd: end, started: false, pendingFrame: null };
  await redis.set(TURN_KEY, JSON.stringify(state));
  return state;
}

async function saveTurn(state: TurnState) {
  await redis.set(TURN_KEY, JSON.stringify(state));
}

router.get('/api/turn', async (_req, res) => {
  try {
    const state = await loadTurn();
    const now = Date.now();
    const timeToEndSeconds = Math.max(0, Math.floor((state.windowEnd - now)/1000));
    res.json({
      currentArtist: state.currentArtist,
      windowStart: state.windowStart,
      windowEnd: state.windowEnd,
      started: state.started,
      timeToEndSeconds
    });
  } catch(e:any) {
    console.error('[turn:get] error', e?.message);
    res.status(500).json({ error: 'turn failed' });
  }
});

router.post('/api/turn', async (_req, res) => {
  try {
    const username = await reddit.getCurrentUsername() || 'anonymous';
    let state = await loadTurn();
    const now = Date.now();
    // If window expired, reset then allow claim
    if (now >= state.windowEnd) {
      state = await resetTurnWindow();
    }
    if (!state.started || !state.currentArtist) {
      // first come first serve claim
      state.currentArtist = username;
      state.started = true;
      await saveTurn(state);
      return res.json({ ok: true, claimed: true, currentArtist: state.currentArtist });
    }
    return res.json({ ok: true, claimed: false, currentArtist: state.currentArtist });
  } catch(e:any) {
    console.error('[turn:post] error', e?.message);
    res.status(500).json({ error: 'turn claim failed' });
  }
});

// Pending frame endpoints (local storage per window)
router.get('/api/pending-frame', async (_req, res) => {
  try {
    const state = await loadTurn();
    if (state.pendingFrame) {
      return res.json({ pending: { url: state.pendingFrame.dataUrl, lastModified: state.pendingFrame.updated } });
    }
    res.json({ pending: null });
  } catch(e:any) {
    console.error('[pending:get] error', e?.message);
    res.status(500).json({ error: 'pending failed' });
  }
});

router.post('/api/pending-frame', async (req, res) => {
  try {
    const username = await reddit.getCurrentUsername() || 'anonymous';
    let state = await loadTurn();
    if (username !== state.currentArtist) return res.status(403).json({ error: 'not artist' });
    const { dataUrl } = req.body || {};
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png')) return res.status(400).json({ error: 'invalid dataUrl' });
    state.pendingFrame = { dataUrl, updated: Date.now() };
    await saveTurn(state);
    res.json({ ok: true });
  } catch(e:any) {
    console.error('[pending:post] error', e?.message);
    res.status(500).json({ error: 'pending store failed' });
  }
});

router.delete('/api/pending-frame', async (_req, res) => {
  try {
    let state = await loadTurn();
    state.pendingFrame = null;
    await saveTurn(state);
    res.json({ ok: true });
  } catch(e:any) {
    console.error('[pending:delete] error', e?.message);
    res.status(500).json({ error: 'pending delete failed' });
  }
});

// Finalize current turn: persist pending frame (if exists) into Redis frame list and reset window
router.post('/api/finalize-turn', async (_req, res) => {
  try {
    let state = await loadTurn();
    const { postId } = context;
    if (!postId) return res.status(400).json({ error: 'post not found' });
    // Persist pending frame if present
    if (state.pendingFrame && state.currentArtist) {
      const frameData: StoredFrame = {
        key: `frames/${Date.now().toString(36)}.png`,
        dataUrl: state.pendingFrame.dataUrl,
        timestamp: Date.now(),
        artist: state.currentArtist
      };
      // store frame
      await redis.set(`frames:data:${postId}:${frameData.key}`, JSON.stringify(frameData));
      // update list
      const frameKeysStr = await redis.get(`frames:list:${postId}`);
      const frameKeys: string[] = frameKeysStr ? JSON.parse(frameKeysStr) : [];
      frameKeys.push(frameData.key);
      await redis.set(`frames:list:${postId}`, JSON.stringify(frameKeys));
    }
    // Reset window so Start Turn is available immediately
    state = await resetTurnWindow();
    await saveTurn(state);
    res.json({ ok: true, reset: true });
  } catch(e:any) {
    console.error('[finalize-turn] error', e?.message);
    res.status(500).json({ error: 'finalize failed' });
  }
});

// Removed external proxy overrides to ensure purely local Reddit-only operation.

// --- Redis-based persistent storage for frames (shared across all users) ---
interface StoredFrame {
  key: string;
  dataUrl: string; // store the full data URL
  timestamp: number;
  artist: string; // reddit username of creator
}

// List frames from Redis storage
router.get('/r2/frames', async (_req, res) => {
  try {
    const { postId } = context;
    if (!postId) return res.json({ frames: [] });
    
    // Get list of frame keys from Redis
    const frameKeysStr = await redis.get(`frames:list:${postId}`);
    const frameKeys: string[] = frameKeysStr ? JSON.parse(frameKeysStr) : [];
    
    // Get all frame data
    const frames: any[] = [];
    for (const key of frameKeys) {
      const frameDataStr = await redis.get(`frames:data:${postId}:${key}`);
      if (frameDataStr) {
        const frameData = JSON.parse(frameDataStr);
        // Skip flagged/deleted frames from public list
        if (frameData.status && frameData.status !== 'active') continue;
        // votes
        const vraw = await redis.get(`frame:votes:${postId}:${key}`);
        let votesUp = 0, votesDown = 0; let myVote: -1|0|1 = 0;
        if (vraw) {
          try { const v = JSON.parse(vraw); votesUp = v.up||0; votesDown = v.down||0; } catch{}
        }
        try {
          const me = await reddit.getCurrentUsername();
          if (me && vraw) { const v = JSON.parse(vraw); const by = v.by||{}; myVote = by[me] ?? 0; }
        } catch {}
        // compute week from timestamp
        const week = getWeekNumber(frameData.timestamp);
        frames.push({
          key: frameData.key,
          url: frameData.dataUrl, // return data URL directly
          lastModified: frameData.timestamp,
          artist: frameData.artist || 'anonymous',
          week,
          votesUp,
          votesDown,
          myVote
        });
      }
    }
    
    frames.sort((a, b) => a.lastModified - b.lastModified);
    res.json({ frames });
  } catch(e: any) {
    console.error('[devvit r2/frames] error', e?.message);
    res.json({ frames: [] });
  }
});

// Get single frame from Redis
router.get('/r2/frame/:key', async (req, res) => {
  try {
    const { postId } = context;
    const key = req.params.key;
    if (!postId) return res.status(404).json({ error: 'post not found' });
    
    const frameDataStr = await redis.get(`frames:data:${postId}:${key}`);
    if (!frameDataStr) return res.status(404).json({ error: 'frame not found' });
    
    const frameData = JSON.parse(frameDataStr);
    
    // Convert data URL to binary and serve as PNG
    const base64 = frameData.dataUrl.split(',')[1];
    if (!base64) return res.status(400).json({ error: 'invalid data URL' });
    const buffer = Buffer.from(base64, 'base64');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.end(buffer);
  } catch(e: any) {
    console.error('[devvit r2/frame] error', e?.message);
    res.status(500).json({ error: 'fail' });
  }
});

// Upload frame to Redis storage
router.post('/r2/upload-frame', async (req, res) => {
  try {
    const { postId } = context;
    const { dataUrl } = req.body || {};
    
    if (!postId) return res.status(400).json({ error: 'post not found' });
    
    console.log('[devvit r2/upload-frame] incoming', dataUrl ? dataUrl.length : 0, 'postId', postId);
    
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) {
      return res.status(400).json({ error: 'invalid dataUrl' });
    }
    
    const base64 = dataUrl.split(',')[1] || '';
    const buffer = Buffer.from(base64, 'base64');
    
    if (buffer.length > 512 * 1024) {
      return res.status(413).json({ error: 'too large' });
    }
    
    const id = Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex');
    const key = `frames/${id}.png`;
    
    // Store frame data in Redis
    const username = await reddit.getCurrentUsername();
    const frameData: StoredFrame = {
      key,
      dataUrl,
      timestamp: Date.now(),
      artist: username || 'anonymous'
    };
    
    await redis.set(`frames:data:${postId}:${key}`, JSON.stringify(frameData));
    
    // Update frames list
    const frameKeysStr = await redis.get(`frames:list:${postId}`);
    const frameKeys: string[] = frameKeysStr ? JSON.parse(frameKeysStr) : [];
    frameKeys.push(key);
    await redis.set(`frames:list:${postId}`, JSON.stringify(frameKeys));
    
    console.log('[devvit r2/upload-frame] stored in redis', key, 'for post', postId);
    res.json({ ok: true, key, url: dataUrl }); // return data URL directly
  } catch(e: any) {
    console.error('[devvit r2/upload-frame] error', e?.message);
    res.status(500).json({ error: 'upload failed', message: e?.message });
  }
});

// Additional endpoint for list-frames (compatibility)
router.get('/api/list-frames', async (_req, res) => {
  try {
    const { postId } = context;
    if (!postId) return res.json({ frames: [] });
    
    // Get list of frame keys from Redis
    const frameKeysStr = await redis.get(`frames:list:${postId}`);
    const frameKeys: string[] = frameKeysStr ? JSON.parse(frameKeysStr) : [];
    
    // Get all frame data
    const frames: any[] = [];
    for (const key of frameKeys) {
      const frameDataStr = await redis.get(`frames:data:${postId}:${key}`);
      if (frameDataStr) {
        const frameData = JSON.parse(frameDataStr);
        if (frameData.status && frameData.status !== 'active') continue;
        const vraw = await redis.get(`frame:votes:${postId}:${key}`);
        let votesUp = 0, votesDown = 0; let myVote: -1|0|1 = 0;
        if (vraw) {
          try { const v = JSON.parse(vraw); votesUp = v.up||0; votesDown = v.down||0; } catch{}
        }
        try {
          const me = await reddit.getCurrentUsername();
          if (me && vraw) { const v = JSON.parse(vraw); const by = v.by||{}; myVote = by[me] ?? 0; }
        } catch {}
        const week = getWeekNumber(frameData.timestamp);
        frames.push({
          key: frameData.key,
          url: frameData.dataUrl,
          lastModified: frameData.timestamp,
          artist: frameData.artist || 'anonymous',
          week,
          votesUp,
          votesDown,
          myVote
        });
      }
    }
    
    frames.sort((a, b) => a.lastModified - b.lastModified);
    res.json({ frames });
  } catch(e: any) {
    console.error('[devvit api/list-frames] error', e?.message);
    res.json({ frames: [] });
  }
});

// --- Voting System Endpoints ---

// Get all proposals for voting
router.get('/api/proposals', async (req, res) => {
  try {
    const { postId } = context;
    if (!postId) return res.json({ proposals: [] });
    const weekParam = req.query.week ? parseInt(String(req.query.week)) : undefined;
    const currentWeek = await ensureCurrentWeek();
    const targetWeek = weekParam || currentWeek;
    const proposalsStr = await redis.get(WEEK_PROPOSALS_KEY(postId, targetWeek));
    const proposals = proposalsStr ? JSON.parse(proposalsStr) : [];
    res.json({ proposals, week: targetWeek });
  } catch(e:any){
    console.error('[devvit api/proposals] error', e?.message);
    res.json({ proposals: [] });
  }
});

// --- Frame Voting & Moderation System ---

type VoteDir = -1 | 0 | 1;
function VOTES_KEY(postId: string, frameKey: string){ return `frame:votes:${postId}:${frameKey}`; }
function MOD_QUEUE_KEY(postId: string){ return `frames:modqueue:${postId}`; }
function MODS_SET_KEY(postId: string){ return `mods:allow:${postId}`; }

async function getVotes(postId: string, frameKey: string){
  const raw = await redis.get(VOTES_KEY(postId, frameKey));
  if (!raw) return { by: {} as Record<string, VoteDir>, up: 0, down: 0 };
  try { const v = JSON.parse(raw); return { by: v.by||{}, up: v.up||0, down: v.down||0 }; } catch { return { by: {}, up: 0, down: 0 }; }
}

async function setVotes(postId: string, frameKey: string, v: { by: Record<string, VoteDir>, up: number, down: number }){
  await redis.set(VOTES_KEY(postId, frameKey), JSON.stringify(v));
}

async function isModUser(username: string | null | undefined, postId: string | null | undefined){
  if (!username || !postId) return false;
  try {
    const raw = await redis.get(MODS_SET_KEY(postId));
    const list: string[] = raw ? JSON.parse(raw) : [];
    return list.includes(username);
  } catch { return false; }
}

// Self-check: am I mod?
router.get('/api/mod/me', async (_req, res) => {
  try {
    const u = await reddit.getCurrentUsername();
    const ok = await isModUser(u, context.postId);
    res.json({ isMod: !!ok, username: u || null });
  } catch { res.json({ isMod: false, username: null }); }
});

// Allowlist management (simple): add/remove moderator usernames
router.post('/api/mods', async (req, res) => {
  try {
    const { postId } = context; if (!postId) return res.status(400).json({ error: 'post not found' });
    const me = await reddit.getCurrentUsername();
    // Only existing mods can modify allowlist
    const allowed = await isModUser(me, postId);
    if (!allowed) return res.status(403).json({ error: 'forbidden' });
    const { username } = req.body || {};
    if (typeof username !== 'string' || !username.trim()) return res.status(400).json({ error: 'username required' });
    const raw = await redis.get(MODS_SET_KEY(postId));
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (!list.includes(username)) list.push(username);
    await redis.set(MODS_SET_KEY(postId), JSON.stringify(list));
    res.json({ ok: true, mods: list });
  } catch(e:any){ res.status(500).json({ error: 'mod add failed', message: e?.message }); }
});

router.delete('/api/mods/:username', async (req, res) => {
  try {
    const { postId } = context; if (!postId) return res.status(400).json({ error: 'post not found' });
    const me = await reddit.getCurrentUsername();
    const allowed = await isModUser(me, postId);
    if (!allowed) return res.status(403).json({ error: 'forbidden' });
    const user = req.params.username;
    const raw = await redis.get(MODS_SET_KEY(postId));
    let list: string[] = raw ? JSON.parse(raw) : [];
    list = list.filter((u)=>u!==user);
    await redis.set(MODS_SET_KEY(postId), JSON.stringify(list));
    res.json({ ok: true, mods: list });
  } catch(e:any){ res.status(500).json({ error: 'mod remove failed', message: e?.message }); }
});

// Cast a vote on a frame (path param)
router.post('/api/frames/:key/vote', async (req, res) => {
  try {
  const { postId } = context; let frameKey = req.params.key as string;
  if (frameKey && frameKey.includes('%')) { try { frameKey = decodeURIComponent(frameKey); } catch {} }
    if (!postId) return res.status(400).json({ error: 'post not found' });
    const me = await reddit.getCurrentUsername(); if (!me) return res.status(401).json({ error: 'auth required' });
    let dir: VoteDir = req.body?.dir; if (dir !== 1 && dir !== -1 && dir !== 0) return res.status(400).json({ error: 'invalid dir' });
    // Load frame
    const fraw = await redis.get(`frames:data:${postId}:${frameKey}`);
    if (!fraw) return res.status(404).json({ error: 'frame not found' });
    const frameData = JSON.parse(fraw);
    if (frameData.status && frameData.status !== 'active') return res.status(400).json({ error: 'frame not active' });
    // Votes
    const v = await getVotes(postId, frameKey);
    const prev: VoteDir = (v.by[me] ?? 0) as VoteDir;
    let next: VoteDir = dir;
    if (prev === dir) next = 0; // toggle off if same click
    v.by[me] = next;
    // recompute counts without scanning whole map by adjusting deltas
    const prevUp = prev === 1 ? 1 : 0; const prevDown = prev === -1 ? 1 : 0;
    const nextUp = next === 1 ? 1 : 0; const nextDown = next === -1 ? 1 : 0;
    v.up = Math.max(0, (v.up || 0) - prevUp + nextUp);
    v.down = Math.max(0, (v.down || 0) - prevDown + nextDown);
    await setVotes(postId, frameKey, v);
    // Threshold: 5 negative votes => flag to moderation queue
    let flagged = false;
    if ((v.down || 0) >= 5) {
      // move from public list to mod queue if not already flagged
      if (!frameData.status || frameData.status === 'active') {
        frameData.status = 'flagged'; frameData.flaggedAt = Date.now();
        await redis.set(`frames:data:${postId}:${frameKey}`, JSON.stringify(frameData));
        // Remove from public list
        const listRaw = await redis.get(`frames:list:${postId}`);
        let list: string[] = listRaw ? JSON.parse(listRaw) : [];
        list = list.filter(k => k !== frameKey);
        await redis.set(`frames:list:${postId}`, JSON.stringify(list));
        // Push to mod queue
        const mqRaw = await redis.get(MOD_QUEUE_KEY(postId));
        const mq: string[] = mqRaw ? JSON.parse(mqRaw) : [];
        if (!mq.includes(frameKey)) mq.push(frameKey);
        await redis.set(MOD_QUEUE_KEY(postId), JSON.stringify(mq));
        flagged = true;
      }
    }
    res.json({ ok: true, votesUp: v.up, votesDown: v.down, myVote: next, status: flagged ? 'flagged' : 'active' });
  } catch(e:any){
    console.error('[devvit api/frames/vote] error', e?.message);
    res.status(500).json({ error: 'vote failed', message: e?.message });
  }
});


// Cast a vote with JSON body key (fallback)
router.post('/api/frame-vote', async (req,res)=>{
  try {
    const { postId } = context; if (!postId) return res.status(400).json({ error: 'post not found' });
    const me = await reddit.getCurrentUsername(); if (!me) return res.status(401).json({ error: 'auth required' });
    let { key, dir } = req.body || {};
    if (typeof key !== 'string' || !key) return res.status(400).json({ error: 'key required' });
    if (key.includes('%')) { try { key = decodeURIComponent(key); } catch {} }
    if (dir !== 1 && dir !== -1 && dir !== 0) return res.status(400).json({ error: 'invalid dir' });
    const fraw = await redis.get(`frames:data:${postId}:${key}`);
    if (!fraw) return res.status(404).json({ error: 'frame not found' });
    const frameData = JSON.parse(fraw);
    if (frameData.status && frameData.status !== 'active') return res.status(400).json({ error: 'frame not active' });
    const v = await getVotes(postId, key);
    const prev: VoteDir = (v.by[me] ?? 0) as VoteDir;
    let next: VoteDir = dir;
    if (prev === dir) next = 0;
    v.by[me] = next;
    const prevUp = prev === 1 ? 1 : 0; const prevDown = prev === -1 ? 1 : 0;
    const nextUp = next === 1 ? 1 : 0; const nextDown = next === -1 ? 1 : 0;
    v.up = Math.max(0, (v.up || 0) - prevUp + nextUp);
    v.down = Math.max(0, (v.down || 0) - prevDown + nextDown);
    await setVotes(postId, key, v);
    let flagged = false;
    if ((v.down || 0) >= 5) {
      if (!frameData.status || frameData.status === 'active') {
        frameData.status = 'flagged'; frameData.flaggedAt = Date.now();
        await redis.set(`frames:data:${postId}:${key}`, JSON.stringify(frameData));
        const listRaw = await redis.get(`frames:list:${postId}`);
        let list: string[] = listRaw ? JSON.parse(listRaw) : [];
        list = list.filter(k => k !== key);
        await redis.set(`frames:list:${postId}`, JSON.stringify(list));
        const mqRaw = await redis.get(MOD_QUEUE_KEY(postId));
        const mq: string[] = mqRaw ? JSON.parse(mqRaw) : [];
        if (!mq.includes(key)) mq.push(key);
        await redis.set(MOD_QUEUE_KEY(postId), JSON.stringify(mq));
        flagged = true;
      }
    }
    res.json({ ok: true, votesUp: v.up, votesDown: v.down, myVote: next, status: flagged ? 'flagged' : 'active' });
  } catch(e:any){
    console.error('[devvit api/frame-vote] error', e?.message);
    res.status(500).json({ error: 'vote failed', message: e?.message });
  }
});

// List flagged frames for moderation queue
router.get('/api/mod/frames', async (_req, res) => {
  try {
    const { postId } = context; if (!postId) return res.json({ frames: [] });
    const me = await reddit.getCurrentUsername(); const allowed = await isModUser(me, postId);
    if (!allowed) return res.status(403).json({ error: 'forbidden' });
    const mqRaw = await redis.get(MOD_QUEUE_KEY(postId));
    const keys: string[] = mqRaw ? JSON.parse(mqRaw) : [];
    const out: any[] = [];
    for (const key of keys) {
      const fraw = await redis.get(`frames:data:${postId}:${key}`);
      if (!fraw) continue;
      const fd = JSON.parse(fraw);
      const vraw = await redis.get(VOTES_KEY(postId, key));
      let votesUp = 0, votesDown = 0;
      if (vraw) { try { const v = JSON.parse(vraw); votesUp = v.up||0; votesDown = v.down||0; } catch{} }
      out.push({ key, url: fd.dataUrl, lastModified: fd.timestamp, artist: fd.artist, votesUp, votesDown, flaggedAt: fd.flaggedAt||null });
    }
    res.json({ frames: out });
  } catch(e:any){ res.status(500).json({ error: 'mod list failed', message: e?.message }); }
});

// Restore a flagged frame to gallery
router.post('/api/mod/frames/:key/restore', async (req, res) => {
  try {
    const { postId } = context; const key = req.params.key; if (!postId) return res.status(400).json({ error: 'post not found' });
    const me = await reddit.getCurrentUsername(); const allowed = await isModUser(me, postId);
    if (!allowed) return res.status(403).json({ error: 'forbidden' });
    const fraw = await redis.get(`frames:data:${postId}:${key}`); if (!fraw) return res.status(404).json({ error: 'frame not found' });
    const fd = JSON.parse(fraw); fd.status = 'active'; delete fd.flaggedAt; await redis.set(`frames:data:${postId}:${key}`, JSON.stringify(fd));
    // Add back to public list (append at end)
    const listRaw = await redis.get(`frames:list:${postId}`); const list: string[] = listRaw ? JSON.parse(listRaw) : [];
    if (!list.includes(key)) { list.push(key); await redis.set(`frames:list:${postId}`, JSON.stringify(list)); }
    // Remove from mod queue
    const mqRaw = await redis.get(MOD_QUEUE_KEY(postId)); let mq: string[] = mqRaw ? JSON.parse(mqRaw) : [];
    mq = mq.filter(k => k !== key); await redis.set(MOD_QUEUE_KEY(postId), JSON.stringify(mq));
    res.json({ ok: true });
  } catch(e:any){ res.status(500).json({ error: 'restore failed', message: e?.message }); }
});

// Permanently delete a flagged frame
router.delete('/api/mod/frames/:key', async (req, res) => {
  try {
    const { postId } = context; const key = req.params.key; if (!postId) return res.status(400).json({ error: 'post not found' });
    const me = await reddit.getCurrentUsername(); const allowed = await isModUser(me, postId);
    if (!allowed) return res.status(403).json({ error: 'forbidden' });
    // Remove data
    await redis.set(`frames:data:${postId}:${key}`, '');
    // Ensure removed from public list
    const listRaw = await redis.get(`frames:list:${postId}`); let list: string[] = listRaw ? JSON.parse(listRaw) : [];
    list = list.filter(k => k !== key); await redis.set(`frames:list:${postId}`, JSON.stringify(list));
    // Remove from mod queue
    const mqRaw = await redis.get(MOD_QUEUE_KEY(postId)); let mq: string[] = mqRaw ? JSON.parse(mqRaw) : [];
    mq = mq.filter(k => k !== key); await redis.set(MOD_QUEUE_KEY(postId), JSON.stringify(mq));
    // Clear votes
    await redis.set(VOTES_KEY(postId, key), '');
    res.json({ ok: true });
  } catch(e:any){ res.status(500).json({ error: 'delete failed', message: e?.message }); }
});

// Submit a new proposal
router.post('/api/proposals', async (req, res) => {
  try {
    const { postId } = context; const { type, title, data } = req.body || {};
    if (!postId) return res.status(400).json({ error: 'post not found' });
    if (!type || !title) return res.status(400).json({ error: 'type and title required' });
    const username = await reddit.getCurrentUsername();
    const week = await ensureCurrentWeek();
    const proposal = { id: Date.now().toString(), type, title, data, proposedBy: username || 'anonymous', proposedAt: Date.now(), votes: 0, voters: [], week };
    const proposalsStr = await redis.get(WEEK_PROPOSALS_KEY(postId, week));
    const proposals = proposalsStr ? JSON.parse(proposalsStr) : [];
    proposals.unshift(proposal);
    await redis.set(WEEK_PROPOSALS_KEY(postId, week), JSON.stringify(proposals));
    console.log('[devvit api/proposals] new proposal added', proposal.id, 'week', week);
    res.json({ ok: true, proposal });
  } catch(e:any){
    console.error('[devvit api/proposals] error', e?.message);
    res.status(500).json({ error:'proposal failed', message:e?.message });
  }
});

// Vote on a proposal
router.post('/api/proposals/:id/vote', async (req,res)=>{
  try {
    const { postId } = context; const proposalId = req.params.id; if(!postId) return res.status(400).json({ error:'post not found' });
    const username = await reddit.getCurrentUsername(); if(!username) return res.status(401).json({ error:'authentication required' });
    const week = await ensureCurrentWeek();
    const proposalsStr = await redis.get(WEEK_PROPOSALS_KEY(postId, week));
    const proposals = proposalsStr ? JSON.parse(proposalsStr) : [];
    const proposal = proposals.find((p:any)=>p.id===proposalId); if(!proposal) return res.status(404).json({ error:'proposal not found' });
    const hasVoted = proposal.voters.includes(username);
    if(hasVoted){ proposal.voters = proposal.voters.filter((v:string)=>v!==username); proposal.votes = Math.max(0, proposal.votes-1); }
    else { proposal.voters.push(username); proposal.votes += 1; }
    await redis.set(WEEK_PROPOSALS_KEY(postId, week), JSON.stringify(proposals));
    console.log('[devvit api/proposals/vote]', username, hasVoted? 'removed vote':'voted', 'on', proposalId, 'week', week);
    res.json({ ok:true, voted: !hasVoted, votes: proposal.votes });
  } catch(e:any){
    console.error('[devvit api/proposals/vote] error', e?.message);
    res.status(500).json({ error:'vote failed', message:e?.message });
  }
});

// Get voting stats
router.get('/api/voting-stats', async (req,res)=>{
  try {
    const { postId } = context; if(!postId) return res.json({ totalVotes:0, activeVoters:0, totalProposals:0 });
    const weekParam = req.query.week ? parseInt(String(req.query.week)) : undefined;
    const currentWeek = await ensureCurrentWeek(); const targetWeek = weekParam || currentWeek;
    const proposalsStr = await redis.get(WEEK_PROPOSALS_KEY(postId, targetWeek));
    const proposals = proposalsStr ? JSON.parse(proposalsStr) : [];
    const totalProposals = proposals.length;
    const totalVotes = proposals.reduce((sum:number,p:any)=>sum+p.votes,0);
    const allVoters = new Set<string>(); proposals.forEach((p:any)=>p.voters.forEach((v:string)=>allVoters.add(v)));
    const activeVoters = allVoters.size;
    res.json({ totalVotes, activeVoters, totalProposals, week: targetWeek });
  } catch(e:any){
    console.error('[devvit api/voting-stats] error', e?.message);
    res.json({ totalVotes:0, activeVoters:0, totalProposals:0 });
  }
});

// Minimal alias for quick user resolution (must be outside other handler)
router.get('/api/whoami', async (_req, res) => {
  try {
    const u = await reddit.getCurrentUsername();
    res.json({ username: u || null });
  } catch(e:any){
    res.json({ username: null });
  }
});

// Get current user info (verbose)
router.get('/api/user', async (_req, res) => {
  try {
    const username = await reddit.getCurrentUsername();
    console.log('[devvit api/user] resolved username', username, 'context.postId', context.postId, 'subreddit', context.subredditName);
    res.json({ username: username || null, context: { postId: context.postId, subreddit: context.subredditName } });
  } catch(e: any) {
    console.error('[devvit api/user] error', e?.message);
    res.json({ username: null, error: e?.message });
  }
});
// --- Week rollover endpoint ---
router.post('/api/rollover-week', async (_req,res)=>{
  try {
    const { postId } = context; if(!postId) return res.status(400).json({ error:'post not found' });
    const currentWeek = await ensureCurrentWeek();
    const { endMs } = getWeekBoundaries(currentWeek);
    const now = Date.now();
    if(now <= endMs) return res.json({ rolled:false, reason:'week not ended', currentWeek });
    const proposalsStr = await redis.get(WEEK_PROPOSALS_KEY(postId, currentWeek));
    const proposals = proposalsStr ? JSON.parse(proposalsStr) : [];
    const paletteWinner = pickWinner(proposals.filter((p:any)=>p.type==='palette')) || null;
    const themeWinner = pickWinner(proposals.filter((p:any)=>p.type==='theme')) || null;
    const brushWinner = pickWinner(proposals.filter((p:any)=>p.type==='brushKit')) || null;
    await redis.set(WEEK_WINNERS_KEY(postId, currentWeek), JSON.stringify({ palette: paletteWinner, theme: themeWinner, brushKit: brushWinner }));
    const newWeek = currentWeek + 1;
    await redis.set(CURRENT_WEEK_KEY, newWeek.toString());
    await redis.set(WEEK_PROPOSALS_KEY(postId, newWeek), JSON.stringify([]));
    res.json({ rolled:true, newWeek });
  } catch(e:any){
    console.error('[devvit api/rollover-week] error', e?.message);
    res.status(500).json({ error:'rollover failed', message:e?.message });
  }
});
// Week info endpoint
router.get('/api/week', async (_req,res)=>{
  try {
    const { postId } = context;
    const currentWeek = await ensureCurrentWeek();
    const { startMs, endMs } = getWeekBoundaries(currentWeek);
    const now = Date.now();
    const secondsUntilEnd = Math.max(0, Math.floor((endMs - now)/1000));
    let winners: any = null;
    if (postId) {
      const wStr = await redis.get(WEEK_WINNERS_KEY(postId, currentWeek - 1));
      if (wStr) {
        try { winners = JSON.parse(wStr); } catch {}
      }
    }
    res.json({ week: currentWeek, startMs, endMs, secondsUntilEnd, previousWinners: winners });
  } catch(e:any){
    console.error('[devvit api/week] error', e?.message);
    res.status(500).json({ error:'week info failed', message:e?.message });
  }
});
// Weekly chat endpoints (persist across the whole week in Devvit Redis)
interface ChatMessage { id:string; user:string; body:string; ts:number; week:number; }
const WEEK_CHAT_KEY = (postId:string,w:number)=>`chat:${postId}:week:${w}`; // JSON array key
const MAX_CHAT_MESSAGES = 500;

router.get('/api/chat', async (req,res)=>{
  try {
    const postId = context.postId;
    if(!postId){
      console.warn('[chat:get] missing postId');
      return res.json({ messages: [], week: 0, postId: null });
    }
    console.log('[chat:get] postId', postId, 'query.week', req.query.week);
    const weekParam = req.query.week ? parseInt(String(req.query.week)) : undefined;
    const currentWeek = await ensureCurrentWeek();
    const targetWeek = weekParam || currentWeek;
  const raw = await redis.get(WEEK_CHAT_KEY(postId, targetWeek));
  let messages: ChatMessage[] = [];
  if(raw){ try { messages = JSON.parse(raw); } catch { messages = []; } }
  console.log('[chat:get] returning', messages.length, 'messages week', targetWeek);
  res.json({ messages, week: targetWeek, postId });
  } catch(e:any){
    console.error('[devvit api/chat:get] error', e?.message);
    res.json({ messages: [] });
  }
});

// Simple in-memory subscriber map for SSE (per process). Devvit environment typically single process.
type SSEClient = { res: express.Response; week:number; postId:string };
const sseClients: Set<SSEClient> = new Set();

function broadcastChatMessage(postId:string, week:number, msg:ChatMessage){
  for(const c of sseClients){
    if(c.postId===postId && c.week===week){
      try { c.res.write(`event: message\n` + `data: ${JSON.stringify(msg)}\n\n`); } catch {}
    }
  }
}

router.get('/api/chat/stream', async (req,res)=>{
  try {
    const postId = context.postId;
    if(!postId){
      console.warn('[chat/stream] missing postId');
      return res.status(400).end();
    }
  console.log('[chat:stream] open postId', postId, 'weekQ', req.query.week);
    const weekParam = req.query.week ? parseInt(String(req.query.week)) : undefined;
    const currentWeek = await ensureCurrentWeek();
    const targetWeek = weekParam || currentWeek;
    res.setHeader('Content-Type','text/event-stream');
    res.setHeader('Cache-Control','no-cache');
    res.setHeader('Connection','keep-alive');
    res.flushHeaders?.();
    // Send current history once
  const raw = await redis.get(WEEK_CHAT_KEY(postId, targetWeek));
  let messages: ChatMessage[] = [];
  if(raw){ try { messages = JSON.parse(raw); } catch { messages = []; } }
  res.write(`event: init\n` + `data: ${JSON.stringify(messages)}\n\n`);
    const client:SSEClient = { res, week: targetWeek, postId };
    sseClients.add(client);
    req.on('close', ()=>{ sseClients.delete(client); });
  } catch(e:any){
    console.error('[devvit api/chat/stream] error', e?.message);
    res.status(500).end();
  }
});

router.post('/api/chat', async (req,res)=>{
  try {
    const postId = context.postId;
    if(!postId){
      return res.status(400).json({ error:'post not found' });
    }
    let username = await reddit.getCurrentUsername();
    if(!username){
      username = 'anon';
    }
  console.log('[chat:post] incoming body', typeof req.body?.body, 'len', (req.body?.body||'').length, 'user', username, 'postId', postId);
    const { body } = req.body || {};
    if(typeof body !== 'string' || !body.trim()) return res.status(400).json({ error:'empty' });
    if(body.length > 280) return res.status(400).json({ error:'too long' });
    const week = await ensureCurrentWeek();
  const key = WEEK_CHAT_KEY(postId, week);
  const msg: ChatMessage = { id: Date.now().toString(36)+Math.random().toString(36).slice(2,6), user: username, body: body.trim(), ts: Date.now(), week };
  const raw = await redis.get(key);
  let arr: ChatMessage[] = [];
  if(raw){ try { arr = JSON.parse(raw); } catch { arr = []; } }
  arr.push(msg);
  if(arr.length > MAX_CHAT_MESSAGES) arr = arr.slice(-MAX_CHAT_MESSAGES);
  await redis.set(key, JSON.stringify(arr));
    console.log('[chat:post] stored', msg.id, 'user', username, 'postId', postId, 'week', week, 'size', arr.length);
    broadcastChatMessage(postId, week, msg);
    res.json({ ok:true, message: msg });
  } catch(e:any){
    console.error('[devvit api/chat:post] error', e?.message);
    res.status(500).json({ error:'chat failed', message:e?.message });
  }
});

// Debug endpoint for chat storage
router.get('/api/chat/debug', async (req,res)=>{
  try {
    const postId = context.postId;
    const weekParam = req.query.week ? parseInt(String(req.query.week)) : undefined;
    const currentWeek = await ensureCurrentWeek();
    const targetWeek = weekParam || currentWeek;
    if(!postId){ return res.json({ ok:false, reason:'no postId', currentWeek, targetWeek }); }
    const key = WEEK_CHAT_KEY(postId, targetWeek);
    let raw = await redis.get(key);
    let arr: ChatMessage[] = [];
    if(raw){ try { arr = JSON.parse(raw); } catch { raw = raw?.slice(0,200)+'/*parse error*/'; }
    }
    // Optional simulate write
    if(req.query.simulate === '1'){
      const msg: ChatMessage = { id: 'dbg-'+Date.now().toString(36), user: 'debug', body: 'debug message', ts: Date.now(), week: targetWeek };
      arr.push(msg);
      if(arr.length > MAX_CHAT_MESSAGES) arr = arr.slice(-MAX_CHAT_MESSAGES);
      await redis.set(key, JSON.stringify(arr));
      raw = await redis.get(key);
    }
    res.json({ ok:true, postId, currentWeek, targetWeek, key, rawLength: raw? raw.length: 0, count: arr.length, sampleLast: arr.slice(-3) });
  } catch(e:any){
    console.error('[chat:debug] error', e?.message);
    res.status(500).json({ ok:false, error: e?.message });
  }
});

// Simple health endpoint for chat diagnostics
router.get('/api/chat/health', async (_req,res)=>{
  try {
    res.json({ ok:true, postId: context.postId || null });
  } catch(e:any){ res.status(500).json({ ok:false, error:e?.message }); }
});
// Use router middleware
app.use(router);

// Debug endpoint to inspect devvit context quickly
router.get('/api/debug/context', (_req, res) => {
  try {
    res.json({
      context: {
        postId: context.postId,
  subreddit: context.subredditName,
      }
    });
  } catch(e:any){
    res.status(500).json({ error: 'debug failed', message: e?.message });
  }
});

// Get port from environment variable with fallback
const port = getServerPort();

// Startup route listing (basic) and log
console.log('[devvit server] starting. Routes registered:');
['/api/init','/api/increment','/api/decrement','/r2/frames','/r2/frame/:key','/r2/upload-frame','/api/r2/frames','/api/r2/frame/:key','/api/r2/upload-frame'].forEach(r=>console.log('  -', r));

// Backward/alternate path support under /api/r2/* for webview discovery
// List frames duplicate (/api/r2/frames for compatibility)
app.get('/api/r2/frames', (_req,res)=>{
  (async () => {
    try {
      const { postId } = context;
      if (!postId) return res.json({ frames: [] });
      
      // Get list of frame keys from Redis
      const frameKeysStr = await redis.get(`frames:list:${postId}`);
      const frameKeys: string[] = frameKeysStr ? JSON.parse(frameKeysStr) : [];
      
      // Get all frame data
      const frames = [];
      for (const key of frameKeys) {
        const frameDataStr = await redis.get(`frames:data:${postId}:${key}`);
        if (frameDataStr) {
          const frameData = JSON.parse(frameDataStr);
          frames.push({
            key: frameData.key,
            url: frameData.dataUrl, // return data URL directly
            lastModified: frameData.timestamp
          });
        }
      }
      
      frames.sort((a, b) => a.lastModified - b.lastModified);
      res.json({ frames });
    } catch(e:any){
      console.error('[devvit api/r2/frames] error', e?.message);
      res.json({ frames: [] });
    }
  })();
});
// Frame proxy duplicate (/api/r2/frame/:key for compatibility)
app.get('/api/r2/frame/:key', (req,res)=>{
  (async () => {
    try {
      const { postId } = context;
      const key = req.params.key;
      if (!postId) return res.status(404).json({ error: 'post not found' });
      
      const frameDataStr = await redis.get(`frames:data:${postId}:${key}`);
      if (!frameDataStr) return res.status(404).json({ error: 'frame not found' });
      
      const frameData = JSON.parse(frameDataStr);
      
      // Convert data URL to binary and serve as PNG
      const base64 = frameData.dataUrl.split(',')[1];
      if (!base64) return res.status(400).json({ error: 'invalid data URL' });
      const buffer = Buffer.from(base64, 'base64');
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.end(buffer);
    } catch(e:any){
      console.error('[devvit api/r2/frame] error', e?.message);
      res.status(500).json({ error:'fail' });
    }
  })();
});
// Upload duplicate (/api/r2/upload-frame for compatibility)
app.post('/api/r2/upload-frame', (req,res)=>{
  (async () => {
    try {
      const { postId } = context;
      const { dataUrl } = req.body || {};
      
      if (!postId) return res.status(400).json({ error: 'post not found' });
      
      console.log('[devvit api/r2/upload-frame] incoming', dataUrl ? dataUrl.length : 0, 'postId', postId);
      
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) {
        return res.status(400).json({ error: 'invalid dataUrl' });
      }
      
      const base64 = dataUrl.split(',')[1] || '';
      const buffer = Buffer.from(base64, 'base64');
      
      if (buffer.length > 512 * 1024) {
        return res.status(413).json({ error: 'too large' });
      }
      
      const id = Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex');
      const key = `frames/${id}.png`;
      
      // Store frame data in Redis
      const username = await reddit.getCurrentUsername();
      const frameData: StoredFrame = {
        key,
        dataUrl,
        timestamp: Date.now(),
        artist: username || 'anonymous'
      };
      
      await redis.set(`frames:data:${postId}:${key}`, JSON.stringify(frameData));
      
      // Update frames list
      const frameKeysStr = await redis.get(`frames:list:${postId}`);
      const frameKeys: string[] = frameKeysStr ? JSON.parse(frameKeysStr) : [];
      frameKeys.push(key);
      await redis.set(`frames:list:${postId}`, JSON.stringify(frameKeys));
      
      console.log('[devvit api/r2/upload-frame] stored in redis', key, 'for post', postId);
      res.json({ ok: true, key, url: dataUrl }); // return data URL directly
    } catch(e:any){
      console.error('[devvit api/r2/upload-frame] error', e?.message);
      res.status(500).json({ error: 'upload failed', message: e?.message });
    }
  })();
});

const server = createServer(app);
server.on('error', (err) => console.error(`server error; ${err.stack}`));
server.listen(port);
