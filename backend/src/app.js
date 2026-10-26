import cors from 'cors';
import express from 'express';
import authRoutes from './routes/authRoutes.js';
import notesRoutes from './routes/notesRoutes.js';
import studyRoutes from './routes/studyRoutes.js';

export function createApp() {
  const app = express();
  app.use(cors({ origin: process.env.clientOrigin || 'http://localhost:5173' }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/', (req, res) => res.send('Welcome to the AI Study Assistant API'));
  app.use('/auth', authRoutes);
  app.use('/notes', notesRoutes);
  app.use('/study', studyRoutes);

  app.use((req, res) => res.status(404).json({ error: 'Not found.' }));

  app.use((error, req, res, next) => {
    console.error(error.message);
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Send valid JSON.' });
    }
    res.status(500).json({ error: 'Request failed. Check that MongoDB and Ollama are running and the models are downloaded.' });
  });
  return app;
}
