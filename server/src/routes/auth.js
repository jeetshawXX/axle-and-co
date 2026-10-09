import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { parse, wrap, badRequest, conflict, unauthorized } from '../errors.js';
import { signToken, requireUser } from '../middleware/auth.js';

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80),
  email: z.string().trim().email('Enter a valid email address').max(160),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100)
});
const loginSchema = z.object({ email: z.string().trim().email('Enter a valid email address'), password: z.string().min(1, 'Enter your password') });
const profileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().max(20).optional()
});

const publicUser = (u) => ({
  id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone || '',
  defaultAddress: u.default_address ? JSON.parse(u.default_address) : null
});

export function authRoutes({ db, config, bcryptRounds = 10 }) {
  const r = Router();
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: config.nodeEnv === 'test' ? 10000 : 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Try again in a few minutes.' } });

  r.post('/register', limiter, wrap(async (req, res) => {
    const body = parse(registerSchema, req.body);
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(body.email)) throw conflict('An account with this email already exists');
    const hash = await bcrypt.hash(body.password, bcryptRounds);
    const id = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)').run(body.name, body.email, hash).lastInsertRowid;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    res.status(201).json({ token: signToken(user, config), user: publicUser(user) });
  }));

  r.post('/login', limiter, wrap(async (req, res) => {
    const body = parse(loginSchema, req.body);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(body.email);
    const ok = user && (await bcrypt.compare(body.password, user.password_hash));
    if (!ok) throw unauthorized('Email or password is incorrect');
    res.json({ token: signToken(user, config), user: publicUser(user) });
  }));

  r.get('/me', requireUser, (req, res) => res.json({ user: publicUser(req.user) }));

  r.patch('/me', requireUser, (req, res) => {
    const body = parse(profileSchema, req.body);
    if (!Object.keys(body).length) throw badRequest('Nothing to update');
    db.prepare('UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone) WHERE id = ?').run(body.name ?? null, body.phone ?? null, req.user.id);
    res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
  });

  return r;
}
