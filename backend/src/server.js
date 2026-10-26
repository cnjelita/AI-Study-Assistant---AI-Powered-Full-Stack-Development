import 'dotenv/config';
import mongoose from 'mongoose';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { User, Note, NoteChunk } from './models.js';
import { createOllama } from './ollama.js';
import { createApp } from './app.js';

let server;
try {
  const config = loadConfig();
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
  await Promise.all([User.init(), Note.init(), NoteChunk.init()]);
  const app = createApp({
    User, Note, NoteChunk, ollama: createOllama(config), jwtSecret: config.jwtSecret,
    distPath: process.env.NODE_ENV === 'production' ? fileURLToPath(new URL('../../frontend/dist/', import.meta.url)) : undefined,
    logError: message => console.error(message),
  });
  server = app.listen(config.port, () => console.log(`Study API listening on port ${config.port}`));
  server.on('error', async () => {
    console.error('Unable to start HTTP server.');
    await mongoose.disconnect();
    process.exitCode = 1;
  });
} catch (error) {
  console.error(error.message.startsWith('JWT_SECRET') || error.message.startsWith('PORT') ? error.message : 'Unable to start API. Check local configuration and MongoDB.');
  await mongoose.disconnect();
  process.exitCode = 1;
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (server) server.close(async () => { await mongoose.disconnect(); process.exit(0); });
    else mongoose.disconnect().then(() => process.exit(0));
  });
}
