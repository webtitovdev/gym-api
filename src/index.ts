import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authRoutes } from './routes/auth.js';
import { syncRoutes } from './routes/sync.js';
import { authMiddleware } from './auth.js';
import './db.js';

const app = new Hono();

app.use('*', logger());
app.use(
  '*',
  cors({
    origin: process.env.CORS_ORIGIN?.split(',').map((s) => s.trim()) || '*',
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  })
);

app.get('/', (c) => c.text('gym-api'));
app.get('/health', (c) => c.json({ ok: true, ts: Date.now() }));

app.route('/auth', authRoutes);

// Protected routes — require Bearer JWT
app.use('/api/*', authMiddleware);
app.route('/api/sync', syncRoutes);

const port = Number(process.env.PORT || 3000);
console.log(`[gym-api] listening on :${port}`);
serve({ fetch: app.fetch, port });
