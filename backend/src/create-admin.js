import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { User } from './models.js';
import { credentials } from './validation.js';

try {
  const { name, email, password } = credentials({
    name: process.env.ADMIN_NAME,
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  }, true);
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/study_assistant', { serverSelectionTimeoutMS: 10000 });
  await User.init();
  await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12), role: 'admin' });
  console.log('Administrator created. Sign in using the configured email.');
} catch (error) {
  console.error(error.code === 11000 ? 'That email already exists; no account was changed.' :
    error.status === 400 ? error.message : 'Unable to create administrator. Check configuration and MongoDB.');
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
