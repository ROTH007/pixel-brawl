// ============================================================
//  Login / Register API  (ចូលគណនី / ចុះឈ្មោះ)
// ============================================================
import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db, publicUser } from './db.ts';
import { sanitizeAppearance } from '../../shared/game.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
if (!process.env.JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET not set — using a dev secret. Set it in production!');
}

export function signToken(userId: string) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '7d' });
}

/** Returns the user id inside a token, or null if the token is invalid */
export function verifyToken(token: unknown): string | null {
  if (typeof token !== 'string') return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    return payload.sub;
  } catch {
    return null;
  }
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  const id = verifyToken(token);
  const user = id ? db.findById(id) : undefined;
  if (!user) return res.status(401).json({ error: 'Please log in again.' });
  (req as any).user = user;
  next();
}

const USERNAME = /^[a-zA-Z0-9_]{3,16}$/;

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || !USERNAME.test(username)) {
    return res.status(400).json({ error: 'Username: 3–16 letters, numbers or _' });
  }
  if (typeof password !== 'string' || password.length < 6 || password.length > 100) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  if (db.findByUsername(username)) {
    return res.status(409).json({ error: 'That username is taken.' });
  }
  const user = db.create(username, await bcrypt.hash(password, 10));
  res.json({ token: signToken(user.id), user: publicUser(user) });
});

authRouter.post('/login', async (req, res) => {
  const { username, password } = req.body ?? {};
  const user = typeof username === 'string' ? db.findByUsername(username) : undefined;
  const ok = user && typeof password === 'string' && (await bcrypt.compare(password, user.passwordHash));
  if (!user || !ok) return res.status(401).json({ error: 'Wrong username or password.' });
  res.json({ token: signToken(user.id), user: publicUser(user) });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser((req as any).user) });
});

authRouter.put('/character', requireAuth, (req, res) => {
  const appearance = sanitizeAppearance(req.body?.appearance);
  db.update((req as any).user.id, { appearance });
  res.json({ appearance });
});
