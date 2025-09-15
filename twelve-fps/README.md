## 12FPS (Devvit App)

Collaborative frame-by-frame animation inside Reddit. Users contribute frames in timed drawing turns, and every week the community votes on the color palette, theme, and special brushes for the next cycle. The result is a community video whose aesthetic is steered by collective decisions.

---
### Goals
- Encourage coordinated yet asynchronous artistic creation.
- Enforce constrained resources (palette, brushes) to keep a cohesive weekly style.
- Integrate native voting + fast in-app state via Redis to close a weekly creative loop.

---
### High-Level Flow
1. Weekly cycle starts (Week N):
	- Voting phase opens (palette, theme, optional special brushes).
	- When voting closes we snapshot the config (cached in Redis).
2. Drawing Sessions (continuous / daily):
	- Each turn grants an exclusive 2h session (soft lock per user).
	- The author draws with only the enabled palette + brush modes.
	- On finish (or early force-end) a PNG/Base64 frame is produced and persisted.
3. Playback / Gallery:
	- Frames are listed + played at 6/12/24 FPS.
	- Each frame shows author, timestamp, week.
4. New Week:
	- Config cache is cleared and a new voting round begins.

---
### Technical Components
| Layer | Tech | Role |
|-------|------|------|
| WebView (post) | React + Vite | Interactive UI (canvas, gallery, video, voting) |
| Devvit Server | Node (Vite SSR build) | Internal endpoints: session lock, save frame, collect votes, weekly rollover task |
| Fast Store | Redis (Devvit integration) | Cache palette/theme, session locks (TTL), vote counters |
| Frame Storage | R2 / S3 / Base64 object | Persist final frame image |
| Weekly Config | Redis + JSON fallback | Snapshot of palette + theme + brushes |

---
### Redis / Key Model
Example keys:
- `week:current` → active week number.
- `week:<n>:config` → JSON (palette[], theme, enabled brushes).
- `session:lock` → userId + start + expiry (2h). TTL=7200s.
- `votes:palette:<n>` → hash { paletteId: count }.
- `votes:theme:<n>` → hash { themeId: count }.
- `votes:brush:<n>` → hash { brushId: count }.
- `frames:week:<n>` → list of frame IDs.
Locks use SET NX EX for atomicity; optional renewal guarded by ownership.

---
### Weekly Voting
1. Open: server seeds candidate palettes/themes (curated or pseudo-random).
2. User votes (rate-limited per user via Redis INCR + TTL bucket).
3. Close: cron (or manual endpoint) tallies results → writes `week:<n+1>:config` and updates `week:current`.
4. UI hydrates from cached new config.

Tie-breaking: earliest threshold (first to reach max) or optional second round.

---
### 2-Hour Turns (Session Lock)
On “Start Session”:
1. Server attempts `SET session:lock {userId,t0} NX EX 7200`.
2. On success returns remaining time for client countdown.
3. User may end early; server clears lock and records timestamp.
4. Natural expiry (no heartbeats) auto-frees slot.

No overlap: new user waits until expiry; UI shows “Busy”.

---
### Frame Save Pipeline
1. Client captures canvas → dataURL PNG (optionally compresses before upload).
2. POST to `/internal/frame/save` with metadata (week, palette hash, author).
3. Server validates lock + active week.
4. Upload to storage (R2, etc.) and push reference + metadata to weekly list.
5. Invalidate/update cache for listings.

---
### Video Playback
- Client fetches chronological frame list.
- Optional prefetch / lazy loading.
- Interval playback (6/12/24 FPS) + progress bar.
- Future export: server composition (ffmpeg WASM or backend job).

---
### Brushes & Constraints
Modes: Solid, Soft, Fade, Spray (experimental others). 
We apply weekly caps (max size, opacity, jitter, density) from config→Redis to enforce cohesion.

---
### Commands (Inside `twelve-fps/`)
- `npm run dev` → watch mode (client + server + playtest).
- `npm run build` → build client and server.
- `npm run build:client` / `build:server` → individual.
- `npm run deploy` → build + upload (`devvit upload`).
- `npm run launch` → publish version.
- `npm run login` → CLI auth.

Root monorepo:
- `npm run deploy:devvit` → root build + sync + server build + upload.
- `npm run deploy:reddit` → orchestrated pipeline (short alias).

---
### WebView Sync Pipeline
Root app builds with hashed assets. Script `tools/sync-devvit.mjs` copies `dist/index.html` + `dist/assets/` to `twelve-fps/dist/client/`, rewrites `/assets/` → `./assets/`, adds timestamp banner, verifies largest JS tail.

---
### Performance Notes
- Canvas caps DPR (<=3) to balance sharpness/memory.
- Spray / Soft brushes use heuristics to limit steps.
- Large frame images lazy load; images use `object-contain` preserving 540×740 aspect.

---
### Security / Anti-Abuse (Planned)
- Rate limit votes & frame saves (Redis INCR + TTL).
- Enforce max image size.
- Basic content filtering placeholder (future moderation layer).
- Audit metadata (userId, timestamps) per frame.

---
### Short-Term Roadmap
- GIF / MP4 export.
- Local Undo/Redo before submission.
- Configurable onion-skin overlay.
- Dynamic palettes with weighting (usage-based curation).
- Dedicated voting modal UI.

---
### Fast Local Dev
```bash
# root
npm install
npm run build        # optional for sync
npm run sync:devvit  # copy assets into WebView
cd twelve-fps
npm run build:server
npx devvit upload
```

Live/test mode:
```bash
cd twelve-fps
npm run dev
```

---
### Common Issues
| Symptom | Cause | Fix |
|---------|-------|-----|
| WebView not updating | Forgot sync after root build | `npm run build && npm run sync:devvit` |
| Old palette showing | Redis cache not invalidated | Run weekly rollover job / delete week keys |
| Turn not releasing | Client abandoned session | Wait TTL or force-release endpoint |

---
### License
BSD-3-Clause (subject to change if needed).

---
### Credits
Built on Devvit + Reddit community. Inspired by pixel-art collabs and jam sessions.

