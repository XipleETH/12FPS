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

const router = express.Router();

router.get<{ postId: string }, InitResponse | { status: string; message: string }>(
  '/api/init',
  async (_req, res): Promise<void> => {
    const { postId } = context;

    if (!postId) {
      console.error('API Init Error: postId not found in devvit context');
      res.status(400).json({
        status: 'error',
        message: 'postId is required but missing from context',
      });
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
      res.status(400).json({
        status: 'error',
        message: 'postId is required',
      });
      return;
    }

    res.json({
      count: await redis.incrBy('count', 1),
      postId,
      type: 'increment',
    });
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

// --- Redis-based persistent storage for frames (shared across all users) ---
interface StoredFrame {
  key: string;
  dataUrl: string; // store the full data URL
  timestamp: number;
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
    const frameData: StoredFrame = {
      key,
      dataUrl,
      timestamp: Date.now()
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
  } catch(e: any) {
    console.error('[devvit api/list-frames] error', e?.message);
    res.json({ frames: [] });
  }
});// Use router middleware
app.use(router);

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
      const frameData = {
        key,
        dataUrl,
        timestamp: Date.now()
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
