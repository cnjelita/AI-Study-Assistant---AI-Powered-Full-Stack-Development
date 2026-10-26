import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../src/app.js';
import NoteChunk from '../src/models/NoteChunk.js';
import User from '../src/models/User.js';

process.env.jwtSecret = 'test-secret';
process.env.ollamaUrl = 'http://ollama.test';
process.env.chatModel = 'test-chat';
process.env.embedModel = 'test-embed';
process.env.ragMinScore = '0.1';

// Fake Ollama: bag-of-words embeddings; chat echoes back the notes it received.
const VOCAB = ['photosynthesis', 'chlorophyll', 'light', 'plant', 'mitochondria', 'cell', 'energy', 'war', 'history'];
const vectorFor = text => VOCAB.map(word => (text.toLowerCase().includes(word) ? 1 : 0));
let chatCalls = [];
const realFetch = globalThis.fetch;

let mongo;
let app;

before(async () => {
  // Set TEST_MONGO_URI to use an existing MongoDB; otherwise an in-memory server is started.
  let uri = process.env.TEST_MONGO_URI;
  if (!uri) {
    mongo = await MongoMemoryServer.create();
    uri = mongo.getUri();
  }
  await mongoose.connect(uri);
  app = createApp();
  globalThis.fetch = async (url, options) => {
    if (!String(url).startsWith('http://ollama.test')) return realFetch(url, options);
    const body = JSON.parse(options.body);
    let payload;
    if (url.endsWith('/api/embed')) {
      payload = { embeddings: body.input.map(vectorFor) };
    } else {
      const input = JSON.parse(body.messages[1].content);
      chatCalls.push(input);
      payload = {
        message: {
          content: JSON.stringify({
            answer: `Answer about ${input.question ?? input.topic}. Notes: ${input.notes.join(' | ')}`,
            practiceQuestions: ['Q1?', 'Q2?', 'Q3?'],
            questions: ['Q1?', 'Q2?', 'Q3?'],
          }),
        },
      };
    }
    return new Response(JSON.stringify(payload), { status: 200 });
  };
});

after(async () => {
  globalThis.fetch = realFetch;
  await mongoose.disconnect();
  await mongo?.stop();
});

beforeEach(async () => {
  chatCalls = [];
  await mongoose.connection.db.dropDatabase();
  await User.init();
});

async function registerAndLogin(name, email, role = 'user') {
  await request(app).post('/auth/register').send({ name, email, password: 'password123' }).expect(201);
  if (role === 'admin') await User.updateOne({ email }, { role: 'admin' });
  const res = await request(app).post('/auth/login').send({ email, password: 'password123' }).expect(200);
  return res.body.token;
}

describe('auth', () => {
  test('register hashes the password and never returns it', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ name: 'Lea', email: 'Lea@Example.com', password: 'password123' })
      .expect(201);
    assert.equal(res.body.user.role, 'user');
    assert.equal(res.body.user.password, undefined);
    const stored = await User.findOne({ email: 'lea@example.com' });
    assert.notEqual(stored.password, 'password123');
    assert.ok(await bcrypt.compare('password123', stored.password));
  });

  test('register rejects invalid input and duplicates', async () => {
    await request(app).post('/auth/register').send({ name: '', email: 'bad', password: '1' }).expect(400);
    await request(app).post('/auth/register').send({}).expect(400);
    await request(app).post('/auth/register').send({ name: 'A', email: 'a@b.co', password: 'password123' }).expect(400);
    await request(app).post('/auth/register').send({ name: 'Ann', email: 'a@b.co', password: 'password123', role: 'admin' }).expect(201);
    assert.equal((await User.findOne({ email: 'a@b.co' })).role, 'user', 'role cannot be self-assigned');
    await request(app).post('/auth/register').send({ name: 'Ann', email: 'a@b.co', password: 'password123' }).expect(409);
  });

  test('login returns a JWT; wrong password is rejected', async () => {
    const token = await registerAndLogin('Lea', 'lea@example.com');
    assert.equal(token.split('.').length, 3);
    await request(app).post('/auth/login').send({ email: 'lea@example.com', password: 'wrongpass' }).expect(401);
    const me = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
    assert.equal(me.body.user.email, 'lea@example.com');
  });

  test('protected endpoints reject missing or invalid tokens', async () => {
    for (const [method, path] of [['get', '/notes'], ['post', '/notes'], ['post', '/study/ask'], ['post', '/study/quiz'], ['get', '/auth/me']]) {
      await request(app)[method](path).send({ question: 'x' }).expect(401);
      await request(app)[method](path).set('Authorization', 'Bearer not-a-jwt').send({ question: 'x' }).expect(401);
    }
  });
});

describe('notes', () => {
  test('learners cannot list or create notes', async () => {
    const token = await registerAndLogin('Lea', 'lea@example.com');
    await request(app).get('/notes').set('Authorization', `Bearer ${token}`).expect(403);
    await request(app)
      .post('/notes')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 't', subject: 's', content: 'c' })
      .expect(403);
  });

  test('admin creates a note that is indexed and listed only for its owner', async () => {
    const adminA = await registerAndLogin('Admin A', 'a@example.com', 'admin');
    const adminB = await registerAndLogin('Admin B', 'b@example.com', 'admin');

    await request(app).post('/notes').set('Authorization', `Bearer ${adminA}`).send({ title: '', subject: 's', content: 'c' }).expect(400);

    const created = await request(app)
      .post('/notes')
      .set('Authorization', `Bearer ${adminA}`)
      .send({ title: 'Photosynthesis Basics', subject: 'Biology', content: 'Plants use light and chlorophyll.', createdBy: new mongoose.Types.ObjectId() })
      .expect(201);
    const aUser = await User.findOne({ email: 'a@example.com' });
    assert.equal(created.body.note.createdBy, aUser._id.toString(), 'createdBy comes from the JWT, not the body');

    const chunks = await NoteChunk.find({ noteId: created.body.note._id });
    assert.equal(chunks.length, 1);
    assert.ok(chunks[0].embedding.length > 0);

    const listA = await request(app).get('/notes').set('Authorization', `Bearer ${adminA}`).expect(200);
    assert.deepEqual(listA.body.notes.map(n => n.title), ['Photosynthesis Basics']);
    const listB = await request(app).get('/notes').set('Authorization', `Bearer ${adminB}`).expect(200);
    assert.deepEqual(listB.body.notes, []);
  });
});

describe('study', () => {
  test('learner gets an answer without private-note context', async () => {
    const admin = await registerAndLogin('Admin A', 'a@example.com', 'admin');
    await request(app).post('/notes').set('Authorization', `Bearer ${admin}`)
      .send({ title: 'Secret', subject: 'Biology', content: 'PRIVATE photosynthesis light plant note' }).expect(201);

    const learner = await registerAndLogin('Lea', 'lea@example.com');
    const res = await request(app).post('/study/ask').set('Authorization', `Bearer ${learner}`)
      .send({ question: 'What is photosynthesis?' }).expect(200);
    assert.match(res.body.answer, /photosynthesis/);
    assert.equal(res.body.usedNotes, 0);
    assert.deepEqual(res.body.practiceQuestions, []);
    assert.deepEqual(chatCalls.at(-1).notes, []);
  });

  test('ask validates input and can include three practice questions', async () => {
    const learner = await registerAndLogin('Lea', 'lea@example.com');
    await request(app).post('/study/ask').set('Authorization', `Bearer ${learner}`).send({ question: '  ' }).expect(400);
    const res = await request(app).post('/study/ask').set('Authorization', `Bearer ${learner}`)
      .send({ question: 'Cells', includeQuiz: true }).expect(200);
    assert.equal(res.body.practiceQuestions.length, 3);
    const quiz = await request(app).post('/study/quiz').set('Authorization', `Bearer ${learner}`)
      .send({ question: 'Cells' }).expect(200);
    assert.equal(quiz.body.questions.length, 3);
  });

  test('admin RAG uses only the logged-in admin\'s own note chunks', async () => {
    const adminA = await registerAndLogin('Admin A', 'a@example.com', 'admin');
    const adminB = await registerAndLogin('Admin B', 'b@example.com', 'admin');
    await request(app).post('/notes').set('Authorization', `Bearer ${adminA}`)
      .send({ title: 'Photosynthesis Basics', subject: 'Biology', content: 'A-ONLY: plants turn light into energy with chlorophyll.' }).expect(201);
    await request(app).post('/notes').set('Authorization', `Bearer ${adminB}`)
      .send({ title: 'Mitochondria', subject: 'Biology', content: 'B-ONLY: mitochondria produce cell energy.' }).expect(201);

    const resA = await request(app).post('/study/ask').set('Authorization', `Bearer ${adminA}`)
      .send({ question: 'How does photosynthesis use light energy?' }).expect(200);
    assert.ok(resA.body.usedNotes >= 1);
    assert.match(resA.body.answer, /A-ONLY/);
    assert.doesNotMatch(resA.body.answer, /B-ONLY/);

    // Admin B asks about Admin A's topic: must not retrieve A's chunk.
    const resB = await request(app).post('/study/ask').set('Authorization', `Bearer ${adminB}`)
      .send({ question: 'How does photosynthesis use light energy?' }).expect(200);
    assert.doesNotMatch(resB.body.answer, /A-ONLY/);
    assert.ok(chatCalls.at(-1).notes.every(note => !note.includes('A-ONLY')));
  });

  test('Ollama failure returns a 500 with a helpful message', async () => {
    const learner = await registerAndLogin('Lea', 'lea@example.com');
    const saved = globalThis.fetch;
    globalThis.fetch = async () => new Response('down', { status: 503 });
    try {
      const res = await request(app).post('/study/ask').set('Authorization', `Bearer ${learner}`)
        .send({ question: 'Cells' }).expect(500);
      assert.match(res.body.error, /Ollama/);
    } finally {
      globalThis.fetch = saved;
    }
  });
});
