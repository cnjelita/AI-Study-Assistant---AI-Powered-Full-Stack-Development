import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(user) {
  return { id: user._id, name: user.name, email: user.email, role: user.role };
}

function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, process.env.jwtSecret, {
    expiresIn: process.env.jwtExpiresIn || '1h',
  });
}

export async function register(req, res) {
  const { name, email, password } = req.body || {};
  const errors = [];
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
    errors.push('Name must be 2-100 characters.');
  }
  if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
    errors.push('Provide a valid email address.');
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
    errors.push('Password must be 8-72 characters.');
  }
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });

  const normalizedEmail = email.trim().toLowerCase();
  if (await User.exists({ email: normalizedEmail })) {
    return res.status(409).json({ error: 'Email is already registered.' });
  }
  const hash = await bcrypt.hash(password, 10);
  // Public registration always creates a learner; admins are promoted via scripts/makeAdmin.js.
  const user = await User.create({ name: name.trim(), email: normalizedEmail, password: hash, role: 'user' });
  res.status(201).json({ user: publicUser(user) });
}

export async function login(req, res) {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  const user = await User.findOne({ email: email.trim().toLowerCase() });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
}

export function me(req, res) {
  res.json({ user: publicUser(req.user) });
}
