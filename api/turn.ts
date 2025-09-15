// @ts-nocheck
/**
 * Simple turn management API (stateless-ish) using deterministic time windows + in-memory lobby snapshot.
 * NOTE: This is ephemeral across server restarts (Vercel lambdas). For production you'd persist in Redis.
 */

let lobby = new Set();
let lastSelected = null; // { user, windowStart }
let lastWindowStart = 0;
let timeOffsetMs = 0; // debug fast-forward offset

function cors(res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
}

const WINDOW_MS = 2 * 60 * 60 * 1000; // 2h
const LOBBY_OPEN_BEFORE_MS = 10 * 60 * 1000; // 10 min
const PICK_BEFORE_MS = 3 * 60 * 1000; // 3 min

function currentWindow(now){
  const midnight = new Date(now);
  midnight.setUTCHours(0,0,0,0); // use UTC for consistency
  const sinceMidnight = now - midnight.getTime();
  const windowIndex = Math.floor(sinceMidnight / WINDOW_MS);
  const start = midnight.getTime() + windowIndex * WINDOW_MS;
  const end = start + WINDOW_MS;
  return { windowIndex, start, end };
}

function computeState(){
  const nowReal = Date.now();
  const now = nowReal + timeOffsetMs;
  const win = currentWindow(now);
  if (lastWindowStart !== win.start){
    // reset lobby for new window
    lobby = new Set();
    lastSelected = null;
    lastWindowStart = win.start;
  }
  const timeToEnd = win.end - now;
  const lobbyOpensAt = win.end - LOBBY_OPEN_BEFORE_MS;
  const pickAt = win.end - PICK_BEFORE_MS;
  const lobbyOpen = now >= lobbyOpensAt;
  const pickingPhase = now >= pickAt;
  // Auto-pick if in picking phase and no selection yet but lobby has users
  if (pickingPhase && !lastSelected && lobby.size){
    const arr = Array.from(lobby);
    const chosen = arr[Math.floor(Math.random()*arr.length)];
    lastSelected = { user: chosen, windowStart: win.start };
  }
  return {
    now,
    offsetMs: timeOffsetMs,
    windowStart: win.start,
    windowEnd: win.end,
    timeToEnd,
    lobbyOpen,
    pickingPhase,
    lobby: Array.from(lobby),
    currentArtist: lastSelected ? lastSelected.user : null,
    selectionFinal: !!lastSelected,
    lobbyOpensIn: lobbyOpen ? 0 : (lobbyOpensAt - now),
    pickIn: pickingPhase ? 0 : (pickAt - now)
  };
}

export default async function handler(req,res){
  cors(res);
  if(req.method==='OPTIONS') return res.status(204).end();

  if(req.method==='GET'){
    return res.status(200).json(computeState());
  }

  if(req.method==='POST'){
  const { action, user } = req.body || {};
    if(!user || typeof user !== 'string' || user.length > 40){
      return res.status(400).json({ error:'invalid user' });
    }
    const st = computeState();
    switch(action){
      case 'join':
        if(!st.lobbyOpen) return res.status(400).json({ error:'lobby not open' });
        lobby.add(user);
        return res.status(200).json(computeState());
      case 'leave':
        lobby.delete(user);
        return res.status(200).json(computeState());
      case 'forceSelect':
        if(!st.lobby.length) return res.status(400).json({ error:'lobby empty' });
        if(st.selectionFinal) return res.status(400).json({ error:'already selected' });
        lastSelected = { user: st.lobby[Math.floor(Math.random()*st.lobby.length)], windowStart: st.windowStart };
        return res.status(200).json(computeState());
      case 'finalize':
        // Clearing selection early ends artist's exclusive window (but next window not started yet) -> allow re-open lobby until pick time again? Simplicity: just keep same selection.
        return res.status(200).json({ ok:true });
      case 'fastForwardLobby':
        // Move virtual time so that we are exactly lobby open moment (10m before end)
        {
          const target = st.windowEnd - LOBBY_OPEN_BEFORE_MS + 1000; // just inside lobby window
          const delta = target - st.now;
          timeOffsetMs += delta;
          return res.status(200).json(computeState());
        }
      default:
        return res.status(400).json({ error:'unknown action' });
    }
  }

  return res.status(405).json({ error:'Method not allowed' });
}
