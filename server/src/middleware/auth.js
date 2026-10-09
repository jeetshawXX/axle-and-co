import jwt from 'jsonwebtoken';
import { unauthorized, forbidden } from '../errors.js';

export function signToken(user, config) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: '7d' });
}

/**
 * Reads the Bearer token (if any) and attaches `req.user`.
 * The user row is re-read on every request so role changes and deletions apply immediately.
 */
export function authenticate({ db, config }) {
  const find = db.prepare('SELECT id, name, email, role, phone, default_address FROM users WHERE id = ?');
  return (req, _res, next) => {
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer ')) {
      try {
        const payload = jwt.verify(header.slice(7), config.jwtSecret);
        const user = find.get(payload.sub);
        if (user) req.user = user;
      } catch {
        /* invalid or expired token: treated as signed out */
      }
    }
    next();
  };
}

export const requireUser = (req, _res, next) => (req.user ? next() : next(unauthorized()));
export const requireAdmin = (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== 'admin') return next(forbidden('Admin access required'));
  next();
};
