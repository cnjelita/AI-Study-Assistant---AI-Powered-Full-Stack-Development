import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { once } from 'node:events';
import { createApp } from '../src/app.js';

export const secret = 'test-only-signing-key-0123456789-abcdef';
export const ids = {
  adminA: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  adminB: 'bbbbbbbbbbbbbbbbbbbbbbbb',
  learner: 'cccccccccccccccccccccccc',
};
const passwordHash = await bcrypt.hash('study-password-2026', 4);

function query(value) {
  return { sort() { return this; }, limit() { return this; }, select() { return this; },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } };
}

export function fixture() {
  const state = {
    users: [
      { _id: ids.adminA, name: 'Admin A', email: 'a@example.test', role: 'admin', passwordHash },
      { _id: ids.adminB, name: 'Admin B', email: 'b@example.test', role: 'admin', passwordHash },
      { _id: ids.learner, name: 'Learner', email: 'learner@example.test', role: 'user', passwordHash },
    ],
    notes: [
      { _id: '111111111111111111111111', title: 'A notes', subject: 'Physics', content: 'PRIVATE_A gravity', createdBy: ids.adminA, status: 'ready' },
      { _id: '222222222222222222222222', title: 'B notes', subject: 'Biology', content: 'PRIVATE_B cells', createdBy: ids.adminB, status: 'ready' },
    ],
    chunks: [
      { noteId: '111111111111111111111111', text: 'PRIVATE_A gravity', embedding: [1, 0] },
      { noteId: '222222222222222222222222', text: 'PRIVATE_B cells', embedding: [0, 1] },
    ],
    calls: { notes: [], chunks: [], embeds: [], prompts: [], users: [] },
    failInsert: false,
    failSave: false,
  };
  const User = {
    async findById(id) { state.calls.users.push(id); return state.users.find(user => user._id === id); },
    findOne({ email }) { return query(state.users.find(user => user.email === email)); },
    async create(data) {
      if (state.users.some(user => user.email === data.email)) throw Object.assign(new Error('duplicate private DB error'), { code: 11000 });
      const user = { ...data, _id: String(state.users.length + 1).padStart(24, '0') };
      state.users.push(user);
      return user;
    },
  };
  const Note = {
    find(filter) {
      state.calls.notes.push(filter);
      return query(state.notes.filter(note => note.createdBy === filter.createdBy && note.status === filter.status));
    },
    async create(data) {
      const note = { ...data, _id: '333333333333333333333333', createdAt: new Date().toISOString() };
      note.save = async () => {
        if (state.failSave) {
          note.status = 'indexing';
          throw new Error('private save failure');
        }
        return note;
      };
      state.notes.push(note);
      return note;
    },
    async deleteOne({ _id }) { state.notes = state.notes.filter(note => note._id !== _id); },
  };
  const NoteChunk = {
    find(filter) {
      state.calls.chunks.push(filter);
      return query(state.chunks.filter(chunk => filter.noteId.$in.includes(chunk.noteId)));
    },
    async insertMany(chunks) {
      state.chunks.push(...chunks);
      if (state.failInsert) throw new Error('private insert failure');
    },
    async deleteMany({ noteId }) { state.chunks = state.chunks.filter(chunk => chunk.noteId !== noteId); },
  };
  const ollama = {
    async embed(input) { state.calls.embeds.push(input); return [1, 0]; },
    async generate(prompt) { state.calls.prompts.push(prompt); return 'A useful study response.'; },
  };
  return { state, User, Note, NoteChunk, ollama, jwtSecret: secret };
}

export function token(id = ids.adminA, extra = {}) {
  return jwt.sign(extra, secret, { algorithm: 'HS256', subject: id, expiresIn: '1h', issuer: 'study-assistant', audience: 'study-assistant-web' });
}

export async function startFixture(t, overrides = {}) {
  const dependencies = { ...fixture(), ...overrides };
  const server = createApp(dependencies).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function request(route, { method = 'GET', body, auth, raw, headers = {} } = {}) {
    const response = await fetch(`${origin}${route}`, {
      method,
      headers: { ...(body !== undefined || raw !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(auth ? { Authorization: 'Bearer ' + auth } : {}), ...headers },
      body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
    const data = await response.json();
    return { status: response.status, data, headers: response.headers };
  }
  return { ...dependencies, request, origin };
}
