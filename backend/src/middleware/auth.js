import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  let payload;
  try {
    payload = jwt.verify(token, process.env.jwtSecret);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
  const user = await User.findById(payload.sub).select('-password');
  if (!user) return res.status(401).json({ error: 'User no longer exists.' });
  req.user = user;
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}
