import { ollama } from './llm.js';
import NoteChunk from './models/NoteChunk.js';

export function chunk(text) {
  const pieces = [];
  for (let start = 0; start < text.length; start += 400) {
    pieces.push(text.slice(start, start + 500));
    if (start + 500 >= text.length) break;
  }
  return pieces;
}

export async function embed(texts) {
  const results = await ollama('/api/embed', { model: process.env.embedModel, input: texts });
  return results.embeddings;
}

export function cosine(a, b) {
  const dot = a.reduce((sum, value, i) => sum + value * b[i], 0);
  const length = Math.hypot(...a) * Math.hypot(...b);
  return length ? dot / length : 0;
}

export async function indexNote(note) {
  const pieces = chunk(note.content).map(
    piece => `Note: ${note.title}\nSubject: ${note.subject}\n${piece}`
  );
  const vectors = await embed(pieces);
  const records = pieces.map((text, i) => ({
    noteId: note._id,
    createdBy: note.createdBy,
    text,
    embedding: vectors[i],
  }));
  await NoteChunk.insertMany(records);
  return records.length;
}

// ownerId must come from the verified JWT user, never from the request body.
export async function searchOwnNotes(ownerId, query, limit = 3) {
  const chunks = await NoteChunk.find({ createdBy: ownerId }).lean();
  if (!chunks.length) return [];
  const [queryVector] = await embed([query]);
  const minScore = Number(process.env.ragMinScore ?? 0.5);
  return chunks
    .map(record => ({ ...record, score: cosine(queryVector, record.embedding) }))
    .filter(record => record.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ noteId, text, score }) => ({ noteId, text, score }));
}
