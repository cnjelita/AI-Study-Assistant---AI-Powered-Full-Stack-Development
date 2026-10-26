import Note from '../models/Note.js';
import NoteChunk from '../models/NoteChunk.js';
import { indexNote } from '../rag.js';

const isText = value => typeof value === 'string' && value.trim().length > 0;

export async function listNotes(req, res) {
  const notes = await Note.find({ createdBy: req.user._id }).sort({ createdAt: -1 });
  res.json({ notes });
}

export async function createNote(req, res) {
  const { title, subject, content } = req.body || {};
  if (!isText(title) || !isText(subject) || !isText(content)) {
    return res.status(400).json({ error: 'Title, subject and content are required.' });
  }
  if (title.length > 200 || subject.length > 100 || content.length > 20000) {
    return res.status(400).json({ error: 'Title max 200, subject max 100, content max 20000 characters.' });
  }
  const note = await Note.create({
    title: title.trim(),
    subject: subject.trim(),
    content: content.trim(),
    createdBy: req.user._id,
  });
  try {
    await indexNote(note);
  } catch (error) {
    // Keep notes and their chunks consistent: roll back if embedding fails.
    await NoteChunk.deleteMany({ noteId: note._id });
    await Note.deleteOne({ _id: note._id });
    throw error;
  }
  res.status(201).json({ note });
}
