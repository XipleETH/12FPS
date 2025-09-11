#!/usr/bin/env node
/**
 * Orchestrate deployment so Reddit frame uses the root app build (with R2 code) as webview.
 * Steps:
 * 1. Run root vite build
 * 2. Run sync-devvit to copy into twelve-fps/dist/client
 * 3. Build only Devvit server (keep client assets we just synced)
 * 4. Run devvit upload inside twelve-fps
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function run(cmd, opts={}){ console.log(`\n[deploy-reddit] $ ${cmd}`); execSync(cmd, { stdio:'inherit', ...opts }); }

const root = process.cwd();
const devvitDir = path.join(root, 'twelve-fps');

if(!fs.existsSync(devvitDir)) throw new Error('Missing twelve-fps directory');

// 1. Root build
run('npm run build');
// 2. Sync
run('npm run sync:devvit');
// 3. Build Devvit server only
run('npm run build:server', { cwd: devvitDir });
// 4. Upload
run('npx devvit upload', { cwd: devvitDir });

console.log('\n[deploy-reddit] Done.');
