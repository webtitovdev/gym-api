import type { Context, Next } from 'hono';
import jwt from 'jsonwebtoken';
import { timingSafeEqual } from 'node:crypto';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

if (SECRET === 'dev-secret-change-me' && process.env.NODE_ENV === 'production') {
  console.warn('[auth] WARNING: using default JWT_SECRET in production. Set JWT_SECRET in .env');
}

export function signToken(): string {
  // No expiry — single-user app, long-lived token is intended
  return jwt.sign({ sub: 'user' }, SECRET);
}

export function verifyPassword(input: string): boolean {
  if (typeof input !== 'string') return false;
  const a = Buffer.from(input);
  const b = Buffer.from(PASSWORD);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function authMiddleware(c: Context, next: Next) {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const token = auth.slice(7);
  try {
    jwt.verify(token, SECRET);
    await next();
    return;
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }
}
