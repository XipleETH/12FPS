import express from 'express';
import { InitResponse, IncrementResponse, DecrementResponse } from '../shared/types/api';
import { redis, reddit, createServer, context, getServerPort } from '@devvit/web/server';
import { createPost } from './core/post';
import crypto from 'node:crypto';

const app = express();

// Middleware for JSON body parsing (increase limit for base64 PNG data URLs)
app.use(express.json({ limit: '3mb' }));
// Middleware for URL-encoded body parsing
app.use(express.urlencoded({ extended: true }));
// Middleware for plain text body parsing
app.use(express.text());

// --- Weekly cycle utilities (Sunday 00:00 ET based week counter) ---
// Requirements:
//  - Week 1 starts now (first time this code runs) at the Sunday 00:00:00 ET (EST fixed UTC-5) that contains 'now'.
//  - Next Sunday 00:00 ET => week 2, etc.
//  - Auto-advance without manual rollover for consumers (chat, proposals, videos, gallery).
// Notes:
//  - We use a fixed offset (UTC-5) to represent ET per user request (no DST complexity for now).
//  - Anchor is stored in Redis so restarts preserve numbering.
//  - A manual rollover endpoint still exists but is optional.
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const ET_FIXED_OFFSET_MS = 5 * 60 * 60 * 1000; // Treat ET as constant UTC-5
const WEEK_ANCHOR_KEY = 'week:anchor:startMs'; // UTC ms of start of week 1
const CURRENT_WEEK_KEY = 'week:current:number'; // cached current week number
const WEEK_TIME_OFFSET_KEY = 'week:timeOffsetMs'; // simulation offset ms
const WEEK_PROPOSALS_KEY = (postId: string, w: number) => `proposals:${postId}:week:${w}`;
const WEEK_WINNERS_KEY = (postId: string, w: number) => `week:winners:${postId}:${w}`;

async function getTimeOffsetMs(): Promise<number> {
  const raw = await redis.get(WEEK_TIME_OFFSET_KEY);
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  return isNaN(n) ? 0 : n;
}

async function nowMs(): Promise<number> { return Date.now() + await getTimeOffsetMs(); }

function startOfSundayWeekET(utcMs: number): number {
  // Convert to pseudo-ET by subtracting fixed offset, go to Sunday 00:00, then add offset back.
  const etMs = utcMs - ET_FIXED_OFFSET_MS;
  const d = new Date(etMs);
  const day = d.getUTCDay(); // 0 = Sunday
  d.setUTCHours(0, 0, 0, 0);
  const sundayStartEtMs = d.getTime() - (day * 24 * 60 * 60 * 1000);
  return sundayStartEtMs + ET_FIXED_OFFSET_MS; // return as UTC epoch
}

function computeWeekNumber(anchorStartMs: number, now: number): number {
  if (now < anchorStartMs) return 1; // safety
  return Math.floor((now - anchorStartMs) / WEEK_MS) + 1;
}

function getWeekBoundariesFromAnchor(anchorStartMs: number, week: number) {
  const startMs = anchorStartMs + (week - 1) * WEEK_MS;
  return { startMs, endMs: startMs + WEEK_MS - 1 };
}

function pickWinner<T extends { votes: number; proposedAt: number }>(items: T[]): T | undefined {
  return items.reduce((b, i) => {
    if (!b) return i;
    if (i.votes > b.votes) return i;
    if (i.votes === b.votes && i.proposedAt < b.proposedAt) return i;
    return b;
  }, undefined as T | undefined);
}

// Normalize proposal types (support synonyms / language variants)
function normalizeProposalType(raw: any): string {
  if (typeof raw !== 'string') return '';
  const t = raw.toLowerCase();
  if (['palette','paleta','colors','colores','palette-colors','color-palette'].includes(t)) return 'palette';
  if (['brushkit','brush-kit','brushes','pinceles','pincel','brushes-kit'].includes(t)) return 'brushKit';
  if (['theme','tema','motif'].includes(t)) return 'theme';
  return raw;
}

async function ensureCurrentWeek(): Promise<number> {
  const now = await nowMs();
  let anchorStr = await redis.get(WEEK_ANCHOR_KEY);
  if (!anchorStr) {
    // First-time initialization: anchor is the Sunday of current time (ET)
    const anchor = startOfSundayWeekET(now);
    await redis.set(WEEK_ANCHOR_KEY, anchor.toString());
    await redis.set(CURRENT_WEEK_KEY, '1');
    return 1;
  }
  const anchorStartMs = parseInt(anchorStr, 10);
  const computedWeek = computeWeekNumber(anchorStartMs, now);
  const storedWeekStr = await redis.get(CURRENT_WEEK_KEY);
  let storedWeek = storedWeekStr ? parseInt(storedWeekStr, 10) : NaN;
  if (!storedWeek || storedWeek < computedWeek) {
    // Auto-advance
    storedWeek = computedWeek;
    await redis.set(CURRENT_WEEK_KEY, storedWeek.toString());
  }
  return storedWeek;
}

function getWeekBoundaries(_week: number) { // underscore prefix to signal intentional unused param (TS/ESLint)
  // Need anchor to compute boundaries
  // (Caller should have called ensureCurrentWeek once in request path to guarantee anchor exists.)
  return {
    startMs: 0,
    endMs: 0,
  };
}

async function getAccurateWeekBoundaries(week: number) {
  const anchorStr = await redis.get(WEEK_ANCHOR_KEY);
  if (!anchorStr) return { startMs: 0, endMs: 0 };
  const anchor = parseInt(anchorStr, 10);
  return getWeekBoundariesFromAnchor(anchor, week);
}

async function computeWeekForTimestamp(ts:number):Promise<number>{
  const anchorStr = await redis.get(WEEK_ANCHOR_KEY);
  if(!anchorStr){ return 1; }
  const anchor = parseInt(anchorStr,10);
  return computeWeekNumber(anchor, ts);
}

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
      const ts = await nowMs();
      const week = await computeWeekForTimestamp(ts);
      const frameData: StoredFrame = {
        key: `frames/${ts.toString(36)}.png`,
        dataUrl: state.pendingFrame.dataUrl,
        timestamp: ts,
        artist: state.currentArtist,
        week
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
  week?: number; // persisted week at creation time
}

// List frames from Redis storage (canonical route)
router.get('/api/list-frames', async (req, res) => {
  try {
    const { postId } = context;
    if (!postId) return res.json({ frames: [] });
    const filterWeek = req.query.week ? parseInt(String(req.query.week),10) : undefined;
    const group = req.query.group === '1' || req.query.group === 'true';
    const frameKeysStr = await redis.get(`frames:list:${postId}`);
    const frameKeys: string[] = frameKeysStr ? JSON.parse(frameKeysStr) : [];
    const frames: any[] = [];
    for (const key of frameKeys) {
      const frameDataStr = await redis.get(`frames:data:${postId}:${key}`);
      if (!frameDataStr) continue;
      const frameData = JSON.parse(frameDataStr);
      if (frameData.status && frameData.status !== 'active') continue;
      const vraw = await redis.get(`frame:votes:${postId}:${key}`);
      let votesUp = 0, votesDown = 0; let myVote: -1|0|1 = 0;
      if (vraw) { try { const v = JSON.parse(vraw); votesUp = v.up||0; votesDown = v.down||0; } catch{} }
      try {
        const me = await reddit.getCurrentUsername();
        if (me && vraw) { const v = JSON.parse(vraw); const by = v.by||{}; myVote = by[me] ?? 0; }
      } catch {}
      const week = frameData.week ?? await computeWeekForTimestamp(frameData.timestamp);
      if (filterWeek && week !== filterWeek) continue;
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
    frames.sort((a,b)=> a.lastModified - b.lastModified);
    if (group) {
      const byWeek: Record<string, any[]> = {};
      for (const f of frames) {
        const wk = (f.week ?? 0).toString();
        if(!byWeek[wk]) byWeek[wk] = [];
        byWeek[wk].push(f);
      }
      return res.json({ framesByWeek: byWeek });
    }
    res.json({ frames });
  } catch(e:any){
    console.error('[devvit r2/frames] error', e?.message);
    res.json({ frames: [] });
  }
});

// Get single frame from Redis (binary PNG)
router.get('/api/frame/:key', async (req, res) => {
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
router.post('/api/upload-frame', async (req, res) => {
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
    
  const ts = await nowMs();
  const id = ts.toString(36) + '-' + crypto.randomBytes(3).toString('hex');
    const key = `frames/${id}.png`;
    
    // Store frame data in Redis
  const username = await reddit.getCurrentUsername();
  const week = await computeWeekForTimestamp(ts);
  const frameData: StoredFrame = { key, dataUrl, timestamp: ts, artist: username || 'anonymous', week };
    
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

// NOTE: /api/list-frames now defined above as canonical; previous duplicate removed.

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
  const ts = await nowMs();
  const proposal = { id: ts.toString(), type, title, data, proposedBy: username || 'anonymous', proposedAt: ts, votes: 0, voters: [], week };
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
    const bounds = await getAccurateWeekBoundaries(currentWeek);
  const now = await nowMs();
    const secondsUntilEnd = Math.max(0, Math.floor((bounds.endMs - now)/1000));
    let winners: any = null;
    let autoMaterialized = false;
    if (postId) {
      const wStr = await redis.get(WEEK_WINNERS_KEY(postId, currentWeek - 1));
      if (wStr) { try { winners = JSON.parse(wStr); } catch {} }
      if (!winners && currentWeek > 1) {
        // Lazy compute winners if still not stored (mirrors logic in week-config)
        const proposalsStr = await redis.get(WEEK_PROPOSALS_KEY(postId, currentWeek - 1));
        const proposals = proposalsStr ? JSON.parse(proposalsStr) : [];
        const paletteWinner = pickWinner(proposals.filter((p:any)=>p.type==='palette')) || null;
        const themeWinner = pickWinner(proposals.filter((p:any)=>p.type==='theme')) || null;
        const brushWinner = pickWinner(proposals.filter((p:any)=>p.type==='brushKit')) || null;
        winners = { palette: paletteWinner, theme: themeWinner, brushKit: brushWinner };
        await redis.set(WEEK_WINNERS_KEY(postId, currentWeek - 1), JSON.stringify(winners));
        autoMaterialized = true;
      }
    }
    res.json({ week: currentWeek, startMs: bounds.startMs, endMs: bounds.endMs, secondsUntilEnd, previousWinners: winners, previousWinnersAutoMaterialized: autoMaterialized });
  } catch(e:any){
    console.error('[devvit api/week] error', e?.message);
    res.status(500).json({ error:'week info failed', message:e?.message });
  }
});

// Week status debug endpoint
router.get('/api/week-status', async (_req,res)=>{
  try {
  const [now, offsetMs] = [await nowMs(), await getTimeOffsetMs()];
    const anchorStr = await redis.get(WEEK_ANCHOR_KEY);
    const currentWeek = await ensureCurrentWeek();
    let anchor = anchorStr ? parseInt(anchorStr,10) : null;
    const bounds = anchor ? getWeekBoundariesFromAnchor(anchor, currentWeek) : { startMs:0, endMs:0 };
    res.json({
      now,
      offsetMs,
      simulated: offsetMs !== 0,
      anchorStartMs: anchor,
      currentWeek,
      startMs: bounds.startMs,
      endMs: bounds.endMs,
      secondsUntilEnd: bounds.endMs ? Math.max(0, Math.floor((bounds.endMs - now)/1000)) : null
    });
  } catch(e:any){
    res.status(500).json({ error:'week-status failed', message:e?.message });
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
    const ts = await nowMs();
    const key = WEEK_CHAT_KEY(postId, week);
    const msg: ChatMessage = { id: ts.toString(36)+Math.random().toString(36).slice(2,6), user: username, body: body.trim(), ts, week };
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
  const ts = await nowMs();
  const msg: ChatMessage = { id: 'dbg-'+ts.toString(36), user: 'debug', body: 'debug message', ts, week: targetWeek };
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
console.log('[devvit server] starting. Routes registered (simplified, Redis-only):');
['/api/init','/api/increment','/api/decrement','/api/list-frames','/api/frame/:key','/api/upload-frame'].forEach(r=>console.log('  -', r));

// Removed legacy compatibility /r2/* and /api/r2/* routes (all Redis-only now).

const server = createServer(app);
server.on('error', (err) => console.error(`server error; ${err.stack}`));
server.listen(port);

// Week simulation endpoint (POST). Body: { action: 'add-days'|'add-weeks'|'set-offset'|'reset', value?: number }
// Helper to lazily compute previous week winners if missing
async function materializePreviousWeekWinners(postId: string, currentWeek: number) {
  if (currentWeek <= 1) return null;
  const existing = await redis.get(WEEK_WINNERS_KEY(postId, currentWeek - 1));
  if (existing) { try { return JSON.parse(existing); } catch { return null; } }
  const proposalsStr = await redis.get(WEEK_PROPOSALS_KEY(postId, currentWeek - 1));
  const proposals = proposalsStr ? JSON.parse(proposalsStr) : [];
  const norm = proposals.map((p:any)=> ({ ...p, _normType: normalizeProposalType(p.type) }));
  const paletteWinner = pickWinner(norm.filter((p:any)=>p._normType==='palette')) || null;
  const themeWinner = pickWinner(norm.filter((p:any)=>p._normType==='theme')) || null;
  const brushWinner = pickWinner(norm.filter((p:any)=>p._normType==='brushKit')) || null;
  let winners = { palette: paletteWinner, theme: themeWinner, brushKit: brushWinner };
  // Carry-over fallback if all null
  if (!winners.palette && !winners.theme && !winners.brushKit) {
    for (let w = currentWeek - 2; w >= 1; w--) {
      const prev = await redis.get(WEEK_WINNERS_KEY(postId, w));
      if (prev) { try { const parsed = JSON.parse(prev); if (parsed && (parsed.palette||parsed.theme||parsed.brushKit)) { winners = parsed; break; } } catch {}
      }
    }
  }
  await redis.set(WEEK_WINNERS_KEY(postId, currentWeek - 1), JSON.stringify(winners));
  // ensure current week proposals array exists
  const curKey = WEEK_PROPOSALS_KEY(postId, currentWeek);
  if (!(await redis.get(curKey))) await redis.set(curKey, JSON.stringify([]));
  return winners;
}

// Week config endpoint to be consumed by drawing page (auto winners)
app.get('/api/week-config', async (_req, res) => {
  try {
    const { postId } = context; const currentWeek = await ensureCurrentWeek();
    const bounds = await getAccurateWeekBoundaries(currentWeek);
    let winners: any = null;
    if (postId) {
      winners = await materializePreviousWeekWinners(postId, currentWeek);
      if (!winners && currentWeek > 2) {
        for (let w = currentWeek - 2; w >= 1; w--) {
          const prev = await redis.get(WEEK_WINNERS_KEY(postId, w));
          if (prev) { try { const parsed = JSON.parse(prev); if (parsed && (parsed.palette||parsed.theme||parsed.brushKit)) { winners = parsed; break; } } catch {}
          }
        }
      }
    }
    const offsetMs = await getTimeOffsetMs();
    res.json({ week: currentWeek, startMs: bounds.startMs, endMs: bounds.endMs, previousWinners: winners, simulated: offsetMs !== 0, offsetMs });
  } catch(e:any){
    console.error('[devvit api/week-config] error', e?.message);
    res.status(500).json({ error:'week-config failed', message:e?.message });
  }
});

// Debug latest frames with stored vs computed week
app.get('/api/debug/frames-latest', async (req, res) => {
  try {
    const { postId } = context; if(!postId) return res.json({ frames: [] });
    const limit = req.query.limit ? parseInt(String(req.query.limit),10) : 25;
    const listRaw = await redis.get(`frames:list:${postId}`); const list:string[] = listRaw ? JSON.parse(listRaw):[];
    const slice = list.slice(-limit);
    const anchorStr = await redis.get(WEEK_ANCHOR_KEY); const anchor = anchorStr ? parseInt(anchorStr,10):0;
    const frames:any[] = [];
    for(const key of slice){
      const raw = await redis.get(`frames:data:${postId}:${key}`); if(!raw) continue;
      try {
        const fd = JSON.parse(raw);
        frames.push({ key, ts: fd.timestamp, storedWeek: fd.week ?? null, computedWeek: anchor? computeWeekNumber(anchor, fd.timestamp): null, artist: fd.artist });
      } catch {}
    }
    res.json({ frames, anchor });
  } catch(e:any){
    console.error('[devvit api/debug/frames-latest] error', e?.message);
    res.status(500).json({ error:'frames-latest failed', message:e?.message });
  }
});

// Debug proposals endpoint
app.get('/api/debug/proposals', async (req, res) => {
  try {
    const { postId } = context; if(!postId) return res.json({ ok:false, reason:'no postId'});
    const weekParam = req.query.week ? parseInt(String(req.query.week),10) : await ensureCurrentWeek();
    const raw = await redis.get(WEEK_PROPOSALS_KEY(postId, weekParam));
    const proposals = raw ? JSON.parse(raw) : [];
    const mapped = proposals.map((p:any)=> ({ id: p.id, type: p.type, norm: normalizeProposalType(p.type), votes: p.votes, proposedAt: p.proposedAt }));
    res.json({ ok:true, week: weekParam, count: proposals.length, mapped });
  } catch(e:any){ res.status(500).json({ ok:false, error:e?.message }); }
});

// Unified draw configuration: winners + palette + brushes + theme + current week
app.get('/api/draw-config', async (req, res) => {
  try {
    const { postId } = context; if(!postId) return res.json({ ok:false, reason:'no postId'});
    const rawFlag = req.query.raw === '1';
    const currentWeek = await ensureCurrentWeek();
    let winners = await materializePreviousWeekWinners(postId, currentWeek);
    if (!winners && currentWeek > 2) {
      for (let w = currentWeek - 2; w >= 1; w--) {
        const prev = await redis.get(WEEK_WINNERS_KEY(postId, w));
        if (prev) { try { const parsed = JSON.parse(prev); if (parsed && (parsed.palette||parsed.theme||parsed.brushKit)) { winners = parsed; break; } } catch {}
        }
      }
    }
    async function fallbackCategory(cat: 'palette'|'theme'|'brushKit'){
      if(!postId) return null;
      const wAny: any = winners;
      if (wAny && wAny[cat]) return wAny[cat];
      for (let w = currentWeek - 2; w >= 1; w--) {
        const prevKey = WEEK_WINNERS_KEY(postId as string, w);
        const prev = await redis.get(prevKey);
        if (prev) {
          try { const parsed = JSON.parse(prev); if (parsed && parsed[cat]) return parsed[cat]; } catch{}
        }
      }
      return null;
    }
    const paletteEntry = await fallbackCategory('palette');
    const brushEntry = await fallbackCategory('brushKit');
    const themeEntry = await fallbackCategory('theme');
    if (!winners) winners = { palette: paletteEntry, brushKit: brushEntry, theme: themeEntry } as any;
    // Robust palette extraction
    function extractPalette(pe:any): string[]{
      if (!pe || !pe.data) return [];
      const d = pe.data;
      if (Array.isArray(d.colors)) return d.colors;
      if (Array.isArray(d.palette)) return d.palette;
      if (Array.isArray(d.hex)) return d.hex;
      if (Array.isArray(d.list)) return d.list;
      if (typeof d === 'object') {
        // attempt flatten values that look like hex strings
        const vals = Object.values(d);
        if (vals.every(v => typeof v === 'string' && /^#?[0-9A-Fa-f]{3,8}$/.test(v as string))) return vals as string[];
      }
      return [];
    }
    const paletteColors = extractPalette(paletteEntry);
    // Robust brush extraction: attempt structured forms and pair ids+names
    function extractBrushes(be:any): any[] {
      if (!be || !be.data) return [];
      const d = be.data;
      const simpleArrayReturn = (arr:any[]): any[] => {
        // Accept arrays of strings or objects already in desired form
        if (!Array.isArray(arr)) return [];
        return arr.map((b:any) => {
          if (b && typeof b === 'object') {
            const id = b.id ?? b.key ?? b.name;
            const name = b.name ?? b.title ?? b.id;
            return { id: String(id).toLowerCase(), name: String(name) };
          }
          return { id: String(b).toLowerCase(), name: String(b) };
        });
      };
      // Direct list forms
      if (Array.isArray(d.brushes)) return simpleArrayReturn(d.brushes);
      if (Array.isArray(d.items)) return simpleArrayReturn(d.items);
      if (Array.isArray(d.kit)) return simpleArrayReturn(d.kit);
      if (Array.isArray(d.list)) return simpleArrayReturn(d.list);
      // ids + names pairing
      if (Array.isArray(d.ids) && Array.isArray(d.names)) {
        const out:any[] = [];
        const len = Math.min(d.ids.length, d.names.length);
        for (let i=0;i<len;i++) {
          const rawId = d.ids[i];
          const rawName = d.names[i];
          out.push({ id: String(rawId).toLowerCase(), name: String(rawName) });
        }
        return out;
      }
      if (Array.isArray(d.ids)) {
        return d.ids.map((id:any) => ({ id: String(id).toLowerCase(), name: String(id) }));
      }
      return [];
    }
    // After extraction, canonicalize ids & names using known presets if possible
    const canonicalBrushName: Record<string,string> = {
      ink: 'Ink',
      acrilico: 'Acrílico',
      marker: 'Marker',
      charcoal: 'Charcoal',
      acuarela: 'Acuarela',
      lapicero: 'Lapicero'
    };
    const brushes = extractBrushes(brushEntry);
    for (const b of brushes) {
      if (!b || typeof b !== 'object') continue;
      if (b.id) {
        const low = String(b.id).toLowerCase();
        b.id = low;
        b.name = canonicalBrushName[low] || b.name || low;
      }
    }
    const theme = themeEntry?.data?.value || themeEntry?.title || null;
    const toolsVersion = [paletteEntry?.id||'', brushEntry?.id||'', themeEntry?.id||''].join('|');
    const tools = {
      palette: { colors: paletteColors, id: paletteEntry?.id || null },
      brushKit: { brushes, id: brushEntry?.id || null },
      theme: { value: theme, id: themeEntry?.id || null }
    };
    const response:any = { ok:true, currentWeek, previousWeek: currentWeek-1, paletteColors, brushes, theme, toolsVersion, tools, winners: winners||null };
    if (!rawFlag) delete response.winners; // hide heavy structure unless requested
    res.json(response);
  } catch(e:any){ res.status(500).json({ ok:false, error:e?.message }); }
});

// Force rebuild / recompute winners for a given week range (admin/debug)
app.post('/api/debug/rebuild-winners', async (req, res) => {
  try {
    const { postId } = context; if(!postId) return res.status(400).json({ ok:false, reason:'no postId'});
    const { fromWeek = 1, toWeek } = req.body || {};
    const currentWeek = await ensureCurrentWeek();
    const end = Math.min(toWeek || currentWeek - 1, currentWeek - 1);
    const rebuilt: Record<number, any> = {};
    for (let w = fromWeek; w <= end; w++) {
      const proposalsStr = await redis.get(WEEK_PROPOSALS_KEY(postId, w));
      const proposals = proposalsStr ? JSON.parse(proposalsStr) : [];
      const norm = proposals.map((p:any)=> ({ ...p, _normType: normalizeProposalType(p.type) }));
      const paletteWinner = pickWinner(norm.filter((p:any)=>p._normType==='palette')) || null;
      const themeWinner = pickWinner(norm.filter((p:any)=>p._normType==='theme')) || null;
      const brushWinner = pickWinner(norm.filter((p:any)=>p._normType==='brushKit')) || null;
      const winners = { palette: paletteWinner, theme: themeWinner, brushKit: brushWinner };
      await redis.set(WEEK_WINNERS_KEY(postId, w), JSON.stringify(winners));
      rebuilt[w] = winners;
    }
    res.json({ ok:true, rebuilt });
  } catch(e:any){ res.status(500).json({ ok:false, error:e?.message }); }
});

// Winners history (lightweight) for diagnostics
app.get('/api/debug/winners-history', async (req, res) => {
  try {
    const { postId } = context; if(!postId) return res.json({ ok:false, reason:'no postId'});
    const upto = req.query.upto ? parseInt(String(req.query.upto),10) : await ensureCurrentWeek();
    const out: Record<number, any> = {};
    for (let w = 1; w < upto; w++) {
      const raw = await redis.get(WEEK_WINNERS_KEY(postId, w));
      if (raw) { try { out[w] = JSON.parse(raw); } catch{} }
    }
    res.json({ ok:true, history: out });
  } catch(e:any){ res.status(500).json({ ok:false, error:e?.message }); }
});

// Raw winners for single week (includes per-category fallback result simulation)
app.get('/api/debug/week-winners', async (req, res) => {
  try {
    const { postId } = context; if(!postId) return res.json({ ok:false, reason:'no postId'});
    const targetWeek = req.query.week ? parseInt(String(req.query.week),10) : (await ensureCurrentWeek()) - 1;
    if (targetWeek < 1) return res.json({ ok:true, week: targetWeek, winners: null });
    const raw = await redis.get(WEEK_WINNERS_KEY(postId, targetWeek));
    let winners = raw ? (()=>{ try { return JSON.parse(raw); } catch { return null; } })() : null;
    res.json({ ok:true, week: targetWeek, winners });
  } catch(e:any){ res.status(500).json({ ok:false, error:e?.message }); }
});

app.post('/api/week-simulate', async (req, res) => {
  try {
    const { action, value } = req.body || {};
    let offset = await getTimeOffsetMs();
    if (action === 'add-days') {
      if (typeof value !== 'number') return res.status(400).json({ error: 'value (days) required' });
      offset += value * 24 * 60 * 60 * 1000;
    } else if (action === 'add-weeks') {
      if (typeof value !== 'number') return res.status(400).json({ error: 'value (weeks) required' });
      offset += value * WEEK_MS;
    } else if (action === 'set-offset') {
      if (typeof value !== 'number') return res.status(400).json({ error: 'value (ms) required' });
      offset = value;
    } else if (action === 'reset') {
      offset = 0;
    } else {
      return res.status(400).json({ error: 'invalid action' });
    }
    await redis.set(WEEK_TIME_OFFSET_KEY, offset.toString());
    const week = await ensureCurrentWeek();
    const anchorStr = await redis.get(WEEK_ANCHOR_KEY);
    const anchor = anchorStr ? parseInt(anchorStr,10) : 0;
    const bounds = getWeekBoundariesFromAnchor(anchor, week);
    res.json({ ok: true, action, offsetMs: offset, week, bounds });
  } catch(e:any){
    console.error('[devvit api/week-simulate] error', e?.message);
    res.status(500).json({ error: 'week-simulate failed', message: e?.message });
  }
});
