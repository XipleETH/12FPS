#!/usr/bin/env node
/**
 * Sync root app production build (dist/assets) into the Devvit webview directory
 * so Reddit frame shows the same UI as Vercel/root deployment.
 *
 * Strategy:
 * 1. Ensure root build exists (runs separately via npm run build before invoking this)
 * 2. Wipe twelve-fps/dist/client/* (but keep directory) to avoid stale hashed chunks
 * 3. Copy root dist/index.html & adjust asset paths if necessary (Vite typically emits relative paths OK)
 * 4. Copy root dist/assets -> twelve-fps/dist/client/assets
 * 5. Inject a small banner comment to indicate synced build + timestamp
 * 6. Optionally: verify largest JS file not truncated by checking end-of-file for a closing source map comment or trailing semicolon
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const rootDist = path.join(root, 'dist');
const devvitClientDist = path.join(root, 'twelve-fps', 'dist', 'client');

function log(msg){
  process.stdout.write(`[sync-devvit] ${msg}\n`);
}

function ensureExists(p){
  if(!fs.existsSync(p)) throw new Error(`Path missing: ${p}`);
}

function emptyDirKeep(dir){
  if(!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  for(const entry of fs.readdirSync(dir)){
    const fp = path.join(dir, entry);
    fs.rmSync(fp, { recursive: true, force: true });
  }
}

function copyRecursive(src, dest){
  const st = fs.statSync(src);
  if(st.isDirectory()){
    fs.mkdirSync(dest, { recursive: true });
    for(const e of fs.readdirSync(src)){
      copyRecursive(path.join(src, e), path.join(dest, e));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function tagFile(file){
  try {
    const orig = fs.readFileSync(file, 'utf8');
    const banner = `/* Synced for Devvit at ${new Date().toISOString()} */\n`;
    fs.writeFileSync(file, banner + orig, 'utf8');
  } catch(e){
    log(`Warn could not tag ${file}: ${e.message}`);
  }
}

function verifyLargestJs(dir){
  const jsFiles = [];
  function walk(d){
    for(const f of fs.readdirSync(d)){
      const fp = path.join(d, f);
      const st = fs.statSync(fp);
      if(st.isDirectory()) walk(fp); else if(/\.js$/.test(f)) jsFiles.push({ file: fp, size: st.size });
    }
  }
  walk(dir);
  if(!jsFiles.length){
    log('No JS files found to verify.');
    return;
  }
  jsFiles.sort((a,b)=>b.size-a.size);
  const largest = jsFiles[0];
  const tail = fs.readFileSync(largest.file, 'utf8').slice(-500);
  if(!/[);\n]\s*$/.test(tail)){
    log(`Warning: largest JS (${path.basename(largest.file)}) tail looks suspicious (possible truncation).`);
  } else {
    log(`Verified largest JS file (${path.basename(largest.file)}) seems complete (size ${largest.size} bytes).`);
  }
}

(async function main(){
  log('Starting sync');
  ensureExists(rootDist);
  ensureExists(path.join(rootDist, 'index.html'));
  ensureExists(devvitClientDist);

  log('Clearing Devvit client dist');
  emptyDirKeep(devvitClientDist);

  // Copy index.html
  const srcIndex = path.join(rootDist, 'index.html');
  let html = fs.readFileSync(srcIndex, 'utf8');
  // If index.html references /assets/ ensure relative ./assets/ for Devvit (safer inside dist/client)
  html = html.replace(/\b\/assets\//g, './assets/');
  // Add banner
  html = `<!-- Synced for Devvit at ${new Date().toISOString()} -->\n` + html;
  fs.writeFileSync(path.join(devvitClientDist, 'index.html'), html, 'utf8');

  // Copy assets
  const srcAssets = path.join(rootDist, 'assets');
  ensureExists(srcAssets);
  copyRecursive(srcAssets, path.join(devvitClientDist, 'assets'));

  // Tag main JS entries (heuristic: files containing 'react' and bigger than 30KB)
  const assetDir = path.join(devvitClientDist, 'assets');
  for(const f of fs.readdirSync(assetDir)){
    if(/\.js$/.test(f)){
      const fp = path.join(assetDir, f);
      const size = fs.statSync(fp).size;
      if(size > 30_000) tagFile(fp);
    }
  }

  verifyLargestJs(devvitClientDist);
  log('Sync complete. You can now run: cd twelve-fps && npm run build:server && devvit upload');
})().catch(err=>{ console.error(err); process.exit(1); });
