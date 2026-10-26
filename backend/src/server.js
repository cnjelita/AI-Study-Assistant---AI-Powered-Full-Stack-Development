import 'dotenv/config';
import { createApp } from './app.js';
import { connectDB } from './db.js';

if (!process.env.jwtSecret) {
  console.error('jwtSecret is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const port = process.env.PORT || 3000;

try {
  await connectDB();
  createApp().listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
} catch (err) {
  console.error('Failed to start:', err.message);
  process.exit(1);
}
