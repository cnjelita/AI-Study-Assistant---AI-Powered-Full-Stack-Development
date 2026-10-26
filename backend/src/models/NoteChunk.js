import mongoose from 'mongoose';

const noteChunkSchema = new mongoose.Schema({
  noteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Note', required: true, index: true },
  // Denormalised owner so RAG retrieval can be filtered by owner directly.
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  text: { type: String, required: true },
  embedding: { type: [Number], required: true },
});

export default mongoose.model('NoteChunk', noteChunkSchema);
