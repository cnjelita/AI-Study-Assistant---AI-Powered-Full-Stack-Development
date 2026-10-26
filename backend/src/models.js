import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, lowercase: true, unique: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['user', 'admin'], default: 'user', required: true },
}, { timestamps: true });

const noteSchema = new mongoose.Schema({
  title: { type: String, required: true, maxlength: 200 },
  subject: { type: String, required: true, maxlength: 100 },
  content: { type: String, required: true, maxlength: 40000 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['indexing', 'ready'], default: 'indexing' },
}, { timestamps: true });
noteSchema.index({ createdBy: 1, status: 1, createdAt: -1 });

const chunkSchema = new mongoose.Schema({
  noteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Note', required: true, index: true },
  text: { type: String, required: true },
  embedding: { type: [Number], required: true },
});

export const User = mongoose.model('User', userSchema);
export const Note = mongoose.model('Note', noteSchema);
export const NoteChunk = mongoose.model('NoteChunk', chunkSchema);
