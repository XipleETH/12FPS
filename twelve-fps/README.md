## Devvit React Starter

A starter to build web applications on Reddit's developer platform

- [Devvit](https://developers.reddit.com/): A way to build and deploy immersive games on Reddit
- [Vite](https://vite.dev/): For compiling the webView
- [React](https://react.dev/): For UI
- [Express](https://expressjs.com/): For backend logic
- [Tailwind](https://tailwindcss.com/): For styles
- [Typescript](https://www.typescriptlang.org/): For type safety

## Getting Started

> Make sure you have Node 22 downloaded on your machine before running!

1. Run `npm create devvit@latest --template=react`
2. Go through the installation wizard. You will need to create a Reddit account and connect it to Reddit developers
3. Copy the command on the success page into your terminal

## Commands

- `npm run dev`: Starts a development server where you can develop your application live on Reddit.
- `npm run build`: Builds your client and server projects
- `npm run deploy`: Uploads a new version of your app
- `npm run launch`: Publishes your app for review
- `npm run login`: Logs your CLI into Reddit
- `npm run check`: Type checks, lints, and prettifies your app

### Extended (Monorepo Wrapper)

From root (outside `twelve-fps/`):
- `npm run deploy:devvit`: Build root, sync assets into Devvit app, build server, upload new version.

## Troubleshooting: WebView shows old version in Reddit

If Reddit displays an outdated UI while localhost/Vercel is newer:
1. Ensure you ran root build: `npm run build` (hashes change in `/dist/assets`).
2. Run sync script: `npm run sync:devvit` (this rewrites `twelve-fps/dist/client/index.html` with a fresh timestamp banner `<!-- Synced for Devvit at ... -->`).
3. Rebuild server bundle: `cd twelve-fps && npm run build:server`.
4. Upload again: `cd twelve-fps && npx devvit upload` (CLI should auto-bump version). Verify new version number increments.
5. Hard refresh inside Reddit frame (open dev tools > Network > Disable cache; reload) or open frame in a private window.
6. Confirm the served HTML inside WebView matches the banner timestamp. If not, likely Reddit cached your previous WebView asset set; wait ~1–2 minutes and retry.
7. If still stale, bump a no-op change in `dist/client/index.html` (e.g., add a comment) and upload again—forces a distinct hash.

Common pitfalls:
- Forgetting `sync-devvit` results in server upload referencing old client bundle.
- Manual edits in `twelve-fps/dist/client/` get overwritten next sync (treat as build artifacts).
- Absolute `/assets/...` paths not rewritten: script rewrites them to `./assets/` for WebView isolation.

## Release Pipeline (Recommended)

```
npm run build
npm run sync:devvit
cd twelve-fps
npm run build:server
npx devvit upload
```

Or single command from root:

```
npm run deploy:devvit
```

Verify at https://developers.reddit.com/apps/<your-app-slug>


## Cursor Integration

This template comes with a pre-configured cursor environment. To get started, [download cursor](https://www.cursor.com/downloads) and enable the `devvit-mcp` when prompted.
