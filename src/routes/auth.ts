import { Hono } from 'hono';
import { signToken, verifyPassword } from '../auth.js';

export const authRoutes = new Hono();

authRoutes.post('/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const password = body.password;
  if (!password || !verifyPassword(password)) {
    return c.json({ error: 'Invalid password' }, 401);
  }
  return c.json({ token: signToken() });
});
