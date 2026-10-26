import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'node:url';
import { ids, secret, token, startFixture } from './helpers.js';
import { OllamaError } from '../src/ollama.js';

test('protected routes reject missing, malformed, expired, wrong-audience, and deleted-user sessions', async t => {
  const { request, state } = await startFixture(t);
  const expired = jwt.sign({}, secret, { subject: ids.adminA, expiresIn: -1, issuer: 'study-assistant', audience: 'study-assistant-web' });
  const wrongAudience = jwt.sign({}, secret, { subject: ids.adminA, audience: 'other', issuer: 'study-assistant' });
  for (const auth of [undefined, 'invalid', expired, wrongAudience, token('dddddddddddddddddddddddd')]) {
    assert.equal((await request('/notes', { auth })).status, 401);
    assert.equal((await request('/study/ask', { method: 'POST', body: { question: 'Explain gravity' }, auth })).status, 401);
  }
  assert.equal(state.calls.notes.length, 0);
  assert.equal(state.calls.embeds.length, 0);
});

test('database role overrides token role, and learners cannot list or create notes', async t => {
  const { request, state } = await startFixture(t);
  const forgedRole = token(ids.learner, { role: 'admin' });
  assert.equal((await request('/notes', { auth: forgedRole })).status, 403);
  assert.equal((await request('/notes', { method: 'POST', body: { title: 'X', subject: 'Y', content: 'Z' }, auth: forgedRole })).status, 403);
  const originalAdminToken = token();
  state.users[0].role = 'user';
  assert.equal((await request('/notes', { auth: originalAdminToken })).status, 403);
  assert.equal(state.calls.notes.length, 0);
});

test('session revalidation returns current database user and role, never token claims or password hashes', async t => {
  const { request, state } = await startFixture(t);
  assert.equal((await request('/auth/me')).status, 401);
  assert.equal((await request('/api/auth/me', { auth: 'invalid' })).status, 401);
  const auth = token(ids.adminA, { name: 'Stale name', role: 'admin' });
  state.users[0].name = 'Updated Name';
  state.users[0].role = 'user';
  const result = await request('/api/auth/me', { auth });
  assert.equal(result.status, 200);
  assert.deepEqual(result.data, {
    user: { id: ids.adminA, name: 'Updated Name', email: 'a@example.test', role: 'user' },
  });
  assert.equal(result.headers.get('cache-control'), 'no-store');
  state.users = state.users.filter(user => user._id !== ids.adminA);
  assert.equal((await request('/auth/me', { auth })).status, 401);
});

test('register normalizes email, hashes passwords, returns only learner-safe user details, and detects duplicates', async t => {
  const { request, state } = await startFixture(t);
  const body = { name: ' New Learner ', email: ' NEW@EXAMPLE.TEST ', password: 'long-enough-password' };
  const result = await request('/auth/register', { method: 'POST', body });
  assert.equal(result.status, 201);
  assert.equal(jwt.verify(result.data.token, secret).sub, '000000000000000000000004');
  assert.deepEqual(result.data.user, { id: '000000000000000000000004', name: 'New Learner', email: 'new@example.test', role: 'user' });
  assert.equal(Object.hasOwn(result.data.user, 'passwordHash'), false);
  const saved = state.users.at(-1);
  assert.notEqual(saved.passwordHash, body.password);
  assert.equal(await bcrypt.compare(body.password, saved.passwordHash), true);
  assert.equal((await request('/auth/register', { method: 'POST', body })).status, 409);
});

test('registration rejects invalid credentials, role injection, bcrypt-truncated passwords, and NoSQL objects', async t => {
  const { request, state } = await startFixture(t);
  const base = { name: 'Name', email: 'valid@example.test', password: 'long-enough-password' };
  for (const change of [
    { name: ' ' }, { email: 'invalid' }, { email: { $ne: null } }, { password: 'short' },
    { password: '🙂'.repeat(20) }, { role: 'admin' }, { password: 'a'.repeat(73) },
  ]) {
    const result = await request('/auth/register', { method: 'POST', body: { ...base, ...change } });
    assert.equal(result.status, 400);
  }
  assert.equal(state.users.length, 3);
});

test('email validation rejects malformed and pathological bounded inputs without database access', async t => {
  const { request, state } = await startFixture(t);
  for (const email of [
    'a@@example.test', '@example.test', 'a@.example', 'a@example.', 'a@example..test',
    'a@exam ple.test', 'a@localhost', 'a'.repeat(240) + '@.',
    'a@' + '.'.repeat(250), 'a'.repeat(10000) + '@example.test',
  ]) {
    const result = await request('/auth/register', {
      method: 'POST', body: { name: 'Learner', email, password: 'study-password-2026' },
    });
    assert.equal(result.status, 400);
  }
  assert.equal(state.users.length, 3);
});

test('login verifies password and returns a signed expiring JWT and user', async t => {
  const { request } = await startFixture(t);
  const result = await request('/auth/login', {
    method: 'POST', body: { email: 'A@EXAMPLE.TEST', password: 'study-password-2026' },
  });
  assert.equal(result.status, 200);
  const claims = jwt.verify(result.data.token, secret, { algorithms: ['HS256'], issuer: 'study-assistant', audience: 'study-assistant-web' });
  assert.equal(claims.sub, ids.adminA);
  assert.equal(claims.exp - claims.iat, 7200);
  assert.equal(Object.hasOwn(claims, 'role'), false);
  assert.equal(result.data.user.role, 'admin');
  assert.equal(Object.hasOwn(result.data.user, 'passwordHash'), false);
  for (const body of [
    { email: 'a@example.test', password: 'wrong-password-value' },
    { email: 'missing@example.test', password: 'study-password-2026' },
  ]) assert.equal((await request('/auth/login', { method: 'POST', body })).status, 401);
  assert.equal((await request('/auth/login', { method: 'POST', body: { email: { $ne: '' }, password: 'study-password-2026' } })).status, 400);
});

test('notes listing and successful indexing are scoped to authenticated administrator', async t => {
  const { request, state } = await startFixture(t);
  const list = await request('/notes', { auth: token() });
  assert.equal(list.status, 200);
  assert.equal(list.data.notes.length, 1);
  assert.equal(list.data.notes[0].title, 'A notes');
  assert.equal(list.data.notes[0].id, '111111111111111111111111');
  assert.equal(Object.hasOwn(list.data.notes[0], '_id'), false);
  const content = 'Long study material. '.repeat(160);
  const created = await request('/notes', {
    method: 'POST', auth: token(),
    body: { title: 'My new notes', subject: 'Science', content, createdBy: ids.adminB },
  });
  assert.equal(created.status, 201);
  const saved = state.notes.at(-1);
  assert.equal(saved.createdBy, ids.adminA);
  assert.equal(saved.status, 'ready');
  assert.ok(state.calls.embeds.length > 1);
  assert.ok(state.chunks.filter(chunk => chunk.noteId === saved._id).length > 1);
  assert.equal(Object.hasOwn(created.data.note, 'status'), false);
});

test('note input limits reject invalid fields before indexing', async t => {
  const { request, state } = await startFixture(t);
  for (const change of [{ title: '' }, { subject: {} }, { content: 'x'.repeat(40001) }]) {
    assert.equal((await request('/notes', {
      method: 'POST', auth: token(), body: { title: 'Title', subject: 'Topic', content: 'Content', ...change },
    })).status, 400);
  }
  assert.equal(state.calls.embeds.length, 0);
});

test('Ollama embedding failure rejects note creation without persisting a note', async t => {
  const { request, state, ollama } = await startFixture(t);
  ollama.embed = async () => { throw new OllamaError('The local AI service is unavailable. Check Ollama and its models.'); };
  const response = await request('/notes', { method: 'POST', auth: token(), body: { title: 'Title', subject: 'Topic', content: 'Content' } });
  assert.equal(response.status, 503);
  assert.equal(state.notes.length, 2);
  assert.equal(state.chunks.length, 2);
});

for (const failure of ['failInsert', 'failSave']) {
  test(`indexing ${failure} cleans partially written note and chunks and never returns success`, async t => {
    const { request, state } = await startFixture(t);
    state[failure] = true;
    const response = await request('/notes', { method: 'POST', auth: token(), body: { title: 'Title', subject: 'Topic', content: 'Content' } });
    assert.equal(response.status, 500);
    assert.deepEqual(response.data, { error: 'An unexpected error occurred.' });
    assert.equal(state.notes.length, 2);
    assert.equal(state.chunks.length, 2);
  });
}

test('admin A and B retrieve exclusively their own chunks before similarity ranking', async t => {
  const { request, state } = await startFixture(t);
  for (const [id, ownMarker, otherMarker, ownNote] of [
    [ids.adminA, 'PRIVATE_A', 'PRIVATE_B', '111111111111111111111111'],
    [ids.adminB, 'PRIVATE_B', 'PRIVATE_A', '222222222222222222222222'],
  ]) {
    const result = await request('/study/ask', { method: 'POST', auth: token(id), body: { question: 'Explain the subject' } });
    assert.equal(result.status, 200);
    assert.equal(result.data.sources[0].noteId, ownNote);
    assert.match(state.calls.prompts.at(-1), new RegExp(ownMarker));
    assert.doesNotMatch(state.calls.prompts.at(-1), new RegExp(otherMarker));
    assert.deepEqual(state.calls.chunks.at(-1), { noteId: { $in: [ownNote] } });
    assert.deepEqual(state.calls.notes.at(-1), { createdBy: id, status: 'ready' });
  }
});

test('learners use general tutoring and practice without note queries or embeddings', async t => {
  const { request, state } = await startFixture(t);
  const result = await request('/study/ask', { method: 'POST', auth: token(ids.learner), body: { question: 'Explain cells', includePractice: true } });
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.sources, []);
  assert.equal(result.data.answer, 'A useful study response.');
  assert.equal(result.data.practice, 'A useful study response.');
  assert.equal(state.calls.prompts.length, 2);
  assert.equal(state.calls.notes.length, 0);
  assert.equal(state.calls.chunks.length, 0);
  assert.equal(state.calls.embeds.length, 0);
  for (const prompt of state.calls.prompts) assert.doesNotMatch(prompt, /PRIVATE_A|PRIVATE_B/);
});

test('admin without notes skips embedding and still receives general tutoring', async t => {
  const { request, state } = await startFixture(t);
  state.notes = [];
  const result = await request('/study/ask', { method: 'POST', auth: token(), body: { question: 'Explain cells' } });
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.sources, []);
  assert.equal(state.calls.embeds.length, 0);
  assert.equal(state.calls.chunks.length, 0);
});

test('quiz respects role isolation and validates count', async t => {
  const { request, state } = await startFixture(t);
  const result = await request('/study/quiz', { method: 'POST', auth: token(ids.learner), body: { topic: 'Calculus', questionCount: 3 } });
  assert.equal(result.status, 200);
  assert.equal(result.data.quiz, 'A useful study response.');
  assert.deepEqual(result.data.sources, []);
  assert.equal(state.calls.embeds.length, 0);
  assert.match(state.calls.prompts[0], /Create 3 quiz questions/);
  for (const questionCount of [0, 11, '3', 2.5]) {
    assert.equal((await request('/study/quiz', { method: 'POST', auth: token(), body: { topic: 'Calculus', questionCount } })).status, 400);
  }
  const adminQuiz = await request('/study/quiz', { method: 'POST', auth: token(ids.adminB), body: { topic: 'Cells' } });
  assert.equal(adminQuiz.status, 200);
  assert.match(state.calls.prompts.at(-1), /PRIVATE_B/);
  assert.doesNotMatch(state.calls.prompts.at(-1), /PRIVATE_A/);
  assert.match(state.calls.prompts.at(-1), /Create 3 quiz questions/);
});

test('study rejects invalid question/practice fields and handles generation outage', async t => {
  const { request, ollama } = await startFixture(t);
  for (const body of [{ question: '' }, { question: {} }, { question: 'x'.repeat(4001) }, { question: 'Cells', includePractice: 'true' }]) {
    assert.equal((await request('/study/ask', { method: 'POST', auth: token(ids.learner), body })).status, 400);
  }
  ollama.generate = async () => { throw new OllamaError('The local AI service is unavailable. Check Ollama and its models.'); };
  const response = await request('/study/ask', { method: 'POST', auth: token(ids.learner), body: { question: 'Explain gravity' } });
  assert.equal(response.status, 503);
  assert.doesNotMatch(JSON.stringify(response.data), /stack|password|token/i);
});

test('invalid JSON, non-object bodies, oversized JSON, and unknown routes have safe JSON errors', async t => {
  const { request } = await startFixture(t);
  assert.equal((await request('/auth/login', { method: 'POST', raw: '{broken' })).status, 400);
  assert.equal((await request('/auth/login', { method: 'POST', body: [] })).status, 400);
  assert.equal((await request('/auth/login', { method: 'POST', body: { extra: 'x'.repeat(140000) } })).status, 413);
  const missing = await request('/missing');
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.data, { error: 'Not found.' });
  assert.equal(missing.headers.get('x-powered-by'), null);
});

test('login and study request limits return 429 with Retry-After', async t => {
  const { request } = await startFixture(t);
  for (let i = 0; i < 10; i++) {
    assert.equal((await request('/auth/register', { method: 'POST', body: {} })).status, 400);
  }
  assert.equal((await request('/auth/register', { method: 'POST', body: {} })).status, 429);
  for (let i = 0; i < 15; i++) {
    assert.equal((await request('/auth/login', { method: 'POST', body: {} })).status, 400);
  }
  const blockedLogin = await request('/auth/login', { method: 'POST', body: {} });
  assert.equal(blockedLogin.status, 429);
  assert.ok(Number(blockedLogin.headers.get('retry-after')) > 0);
  for (let i = 0; i < 30; i++) {
    assert.equal((await request('/study/ask', { method: 'POST', auth: token(ids.learner), body: { question: 'Explain gravity' } })).status, 200);
  }
  assert.equal((await request('/study/ask', { method: 'POST', auth: token(ids.learner), body: { question: 'Explain gravity' } })).status, 429);
  assert.equal((await request('/study/ask', { method: 'POST', auth: token(ids.adminA), body: { question: 'Explain gravity' } })).status, 200);
});

test('note indexing limit is per administrator and independent of other users', async t => {
  const { request } = await startFixture(t);
  for (let i = 0; i < 10; i++) {
    assert.equal((await request('/notes', { method: 'POST', auth: token(ids.adminA), body: {} })).status, 400);
  }
  assert.equal((await request('/notes', { method: 'POST', auth: token(ids.adminA), body: {} })).status, 429);
  assert.equal((await request('/notes', { method: 'POST', auth: token(ids.adminB), body: {} })).status, 400);
});

test('global IP limit covers aliases, auth database access, note listing, parsing, and SPA files', async t => {
  const { request, state } = await startFixture(t, { distPath: fileURLToPath(new URL('./fixtures/', import.meta.url)) });
  const auth = token();
  assert.equal((await request('/api/auth/me', { auth })).status, 200);
  for (let i = 0; i < 299; i++) assert.equal((await request('/api/missing')).status, 404);
  for (const route of ['/api/auth/me', '/auth/me', '/api/notes', '/notes', '/study']) {
    const result = await request(route, { auth, headers: { Accept: 'text/html' } });
    assert.equal(result.status, 429);
    assert.deepEqual(result.data, { error: 'Too many requests. Try again later.' });
    assert.ok(Number(result.headers.get('retry-after')) > 0);
    assert.ok(result.headers.has('ratelimit'));
    assert.equal(result.headers.has('x-ratelimit-limit'), false);
  }
  assert.equal((await request('/api/study/ask', { method: 'POST', auth, raw: '{broken' })).status, 429);
  assert.equal(state.calls.users.length, 1);
  assert.equal(state.calls.notes.length, 0);
  assert.equal(state.calls.embeds.length, 0);
});

test('production SPA fallback serves frontend routes but never API errors or missing assets', async t => {
  const { request, origin } = await startFixture(t, { distPath: fileURLToPath(new URL('./fixtures/', import.meta.url)) });
  const response = await fetch(`${origin}/dashboard`, { headers: { Accept: 'text/html' } });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Study app test fixture/);
  const studyPage = await fetch(`${origin}/study`, { headers: { Accept: 'text/html' } });
  assert.equal(studyPage.status, 200);
  assert.match(await studyPage.text(), /Study app test fixture/);
  for (const route of ['/auth/missing', '/study/missing', '/study/ask', '/study/quiz', '/notes/missing', '/api/missing', '/missing.js']) {
    const result = await request(route, { headers: { Accept: 'text/html' } });
    assert.equal(result.status, 404);
    assert.deepEqual(result.data, { error: 'Not found.' });
  }
});

test('unexpected database failures do not expose internals', async t => {
  const { request, User } = await startFixture(t);
  User.findById = async () => { throw new Error('Sensitive internal database information'); };
  const response = await request('/notes', { auth: token() });
  assert.equal(response.status, 500);
  assert.deepEqual(response.data, { error: 'An unexpected error occurred.' });
});

test('same-origin /api alias supports auth, notes, study, and JSON 404s without SPA fallback', async t => {
  const { request, state } = await startFixture(t, { distPath: fileURLToPath(new URL('./fixtures/', import.meta.url)) });
  assert.equal((await request('/api/notes')).status, 401);
  const registration = await request('/api/auth/register', {
    method: 'POST', body: { name: 'New Learner', email: 'new@example.test', password: 'study-password-2026' },
  });
  assert.equal(registration.status, 201);
  assert.equal(registration.headers.get('cache-control'), 'no-store');
  assert.equal(jwt.verify(registration.data.token, secret).sub, registration.data.user.id);
  assert.equal(registration.data.user.role, 'user');
  const me = await request('/api/auth/me', { auth: registration.data.token });
  assert.equal(me.status, 200);
  assert.deepEqual(me.data.user, registration.data.user);
  assert.equal(me.headers.get('cache-control'), 'no-store');
  const login = await request('/api/auth/login', {
    method: 'POST', body: { email: 'a@example.test', password: 'study-password-2026' },
  });
  assert.equal(login.status, 200);
  const notes = await request('/api/notes', { auth: login.data.token });
  assert.equal(notes.status, 200);
  assert.equal(notes.headers.get('cache-control'), 'no-store');
  assert.equal(notes.data.notes[0].id, '111111111111111111111111');
  assert.equal(Object.hasOwn(notes.data.notes[0], '_id'), false);
  const answer = await request('/api/study/ask', { method: 'POST', auth: login.data.token, body: { question: 'Explain gravity' } });
  assert.equal(answer.status, 200);
  assert.equal(typeof answer.data.answer, 'string');
  assert.equal(answer.headers.get('cache-control'), 'no-store');
  const quiz = await request('/api/study/quiz', {
    method: 'POST', auth: registration.data.token, body: { topic: 'Gravity' },
  });
  assert.equal(quiz.status, 200);
  assert.match(state.calls.prompts.at(-1), /Create 3 quiz questions/);
  for (const route of ['/api/missing', '/api/dashboard', '/api', '/api?query=test', '/api/index.html']) {
    const missing = await request(route, { headers: { Accept: 'text/html' } });
    assert.equal(missing.status, 404);
    assert.deepEqual(missing.data, { error: 'Not found.' });
    assert.equal(missing.headers.get('cache-control'), 'no-store');
  }
});
