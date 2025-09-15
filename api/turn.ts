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
// Semana comienza Domingo 00:00 EST (usamos offset fijo UTC-5, sin DST para simplicidad)
// EST fija = UTC-5 => offset en ms
const EST_OFFSET_MS = 5 * 60 * 60 * 1000; // restaremos esto para alinear a EST fija

function getWeekStartEst(now){
  // Convertimos 'now' (ms epoch UTC) a tiempo local EST fijo restando 5h
  const estTime = now - EST_OFFSET_MS;
  const d = new Date(estTime);
  // Obtener día de la semana en EST (0=Sunday)
  const day = d.getUTCDay();
  // Normalizar a domingo 00:00 EST: quitar horas/min/seg/ms y retroceder 'day' días
  d.setUTCHours(0,0,0,0);
  const estMidnight = d.getTime() - day * 24 * 60 * 60 * 1000;
  // Regresamos al epoch UTC sumando offset de nuevo
  return estMidnight + EST_OFFSET_MS;
}

function currentWindow(now){
  const weekStart = getWeekStartEst(now);
  const sinceWeekStart = now - weekStart;
  const windowIndexGlobal = Math.floor(sinceWeekStart / WINDOW_MS); // index dentro de la semana
  const start = weekStart + windowIndexGlobal * WINDOW_MS;
  const end = start + WINDOW_MS;
  return { windowIndex: windowIndexGlobal, start, end, weekStart };
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
  const lobbyOpen = true;
  const pickingPhase = false;
  // At exact start of new window: clear previous selection
  // At window start selection should already be made from previous window's lobby. We ensure selection for current window by checking lastSelected.windowStart.
  // Force artist override (development)
  const FORCED_USER = 'Consistent_Reply_557';
  if (!lastSelected || lastSelected.windowStart !== win.start){
    lastSelected = { user: FORCED_USER, windowStart: win.start };
  } else if (lastSelected.user !== FORCED_USER) {
    // Maintain forced user even if prior selection existed
    lastSelected = { user: FORCED_USER, windowStart: win.start };
  }
  return {
    now,
    offsetMs: timeOffsetMs,
    windowStart: win.start,
    windowEnd: win.end,
    timeToEnd,
    timeToEndSeconds: Math.max(0, Math.floor(timeToEnd/1000)),
    weekStart: win.weekStart,
    weekWindowIndex: win.windowIndex,
  lobbyOpen,
  pickingPhase, // deprecated (always false)
    lobby: Array.from(lobby),
  currentArtist: lastSelected ? lastSelected.user : null,
  forcedArtist: true,
    selectionFinal: !!lastSelected,
    lobbyOpensIn: 0,
    pickIn: 0
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
        {
          // Force jump to next window start, select immediately
          const nextWindowStart = st.windowEnd;
            const delta = (nextWindowStart + 1000) - st.now;
            timeOffsetMs += delta;
            // After adjusting time, a computeState call will auto select from lobby (if any)
            return res.status(200).json(computeState());
        }
      default:
        return res.status(400).json({ error:'unknown action' });
    }
  }

  return res.status(405).json({ error:'Method not allowed' });
}
