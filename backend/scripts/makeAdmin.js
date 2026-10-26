import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../src/db.js';
import User from '../src/models/User.js';

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('Usage: npm run make-admin -- <email>');
  process.exit(1);
}

await connectDB();
const user = await User.findOneAndUpdate({ email }, { role: 'admin' }, { returnDocument: 'after' });
console.log(user ? `${user.email} is now an admin.` : `No user registered with ${email}.`);
await mongoose.disconnect();
process.exit(user ? 0 : 1);
