# 12FPS — Collaborative Frame-by-Frame Drawing Game for Reddit

A UGC-friendly drawing toy where redditors create frame-by-frame animations together. Each session runs on a timer; creators add frames using a constrained weekly color palette. Frames can be browsed as a gallery or played back as a video.

Built with React + TypeScript + Vite. Designed for Devvit Web Interactive Posts.

## Why it fits the hackathon
- UGC Games category: every post becomes a community-made animation; users contribute drawings as frames.
- Daily Games pattern: sessions are timeboxed, and the palette rotates weekly to keep content fresh and discussion going.
- Devvit Web ready: the app runs as a self-contained web bundle and uses familiar web tech.

## How to play
- Start session: press Start to begin the timer (2 hours).
- Draw: mouse or stylus draws; your finger pans the canvas.
- Zoom: only via the vertical slider (100%–400%).
- Brushes: Solid, Soft, Fade, Spray; adjust brush size with the slider.
- Palette: curated weekly palette; pick a swatch.
- Save frame: commits the current canvas as a frame.
- Gallery/Video: browse saved frames or play them back.

## Controls
- Mouse / Stylus: draw with primary button/pen tip; right mouse button pans.
- Touch (finger): pan only (no drawing).
- Zoom: vertical slider only. Wheel and pinch gestures are disabled.

## Submission checklist (fill before submitting)
- App listing URL: https://developers.reddit.com/apps/APP-NAME-HERE
- Demo subreddit: https://reddit.com/r/YOUR_SUBREDDIT
- Demo post (Interactive Post running the app): https://reddit.com/r/YOUR_SUBREDDIT/comments/POST_ID
- Developer usernames: u/yourname, u/teammate
- Optional video (≤ 1 minute): https://link.example/video
- Optional feedback survey submitted: Yes/No

## Local development
```powershell
# Windows PowerShell
npm install
npm run dev
# Open the shown localhost URL
```

## Build
```powershell
npm run build
# Output: dist/
```

## Devvit Web (Interactive Posts) notes
Because Devvit Web documentation URLs can change, follow the Interactive Posts Quickstart from the Dev Portal:
- Dev Portal: https://developers.reddit.com/docs/
- Community: r/devvit and Discord https://discord.gg/Cd43ExtEFS

High-level steps you’ll complete when publishing:
- Create a new Devvit app in the Developer Portal.
- Choose the Web (Interactive Post) option.
- Upload the production build (dist/) as the web bundle, or point to the hosted bundle.
- Create a test subreddit and an Interactive Post using your app.
- Copy the app listing link and demo post link into the checklist above.

If you want, we can add the platform manifest (e.g., devvit.yaml) once you share the exact Devvit Web config requirements for your account.

## Technical details
- Stack: React 18, TypeScript, Vite, TailwindCSS, lucide-react icons.
- Canvas: fixed logical size 960×600 with zoom (100%–400%).
- Input model:
  - Pen/Mouse draws with pointer capture; right click pans.
  - Finger pans via pointer events; drawing with touch is disabled.
  - Wheel and pinch zoom are disabled; only the slider changes zoom.
- Brush modes: solid, soft (radial gradient), fade (progressively lowers alpha), spray (particle field).

## Moderation & safety considerations (polish targets)
- Optional: add per-frame author attribution and basic reporting.
- Optional: rate limiting per user/session to reduce spam.
- Optional: export/share controls and flair for “featured” animations.

## Roadmap for extra polish (post-MVP)
- Undo/Redo per user session.
- Onion-skin overlay while drawing next frame.
- In-canvas tools: line/shape, fill, color picker.
- Playback controls: FPS slider, scrubbing, download MP4/GIF.
- Basic unit tests for core brush utilities.

## License
Provide your chosen license here (MIT/Apache-2.0), or keep proprietary for the hackathon.
