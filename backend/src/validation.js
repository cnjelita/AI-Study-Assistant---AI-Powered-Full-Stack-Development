export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function text(value, label, max, min = 1) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    throw new HttpError(400, `${label} must contain ${min}–${max} characters.`);
  }
  return value.trim();
}

export function credentials(body, withName = false) {
  const email = text(body.email, 'Email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'A valid email is required.');
  const password = body.password;
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new HttpError(400, 'Password must be at least 12 characters and at most 72 UTF-8 bytes.');
  }
  return { email, password, ...(withName ? { name: text(body.name, 'Name', 100) } : {}) };
}
