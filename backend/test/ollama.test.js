import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { createOllama, OllamaError, chunkText, cosineSimilarity } from '../src/ollama.js';
import { loadConfig, validateSecret } from '../src/config.js';

test('Ollama client uses native HTTP embed and generate APIs with configurable models', async t => {
  const calls = [];
  const server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    calls.push({ path: req.url, body: JSON.parse(raw) });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(req.url === '/api/embed' ? { embeddings: [[0.1, 0.3]] } : { response: ' Explained. ' }));
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const ollama = createOllama({
    ollamaUrl: `http://127.0.0.1:${server.address().port}`, generationModel: 'test-chat', embeddingModel: 'test-embed',
  });
  assert.deepEqual(await ollama.embed('Study this'), [0.1, 0.3]);
  assert.equal(await ollama.generate('Explain'), 'Explained.');
  assert.deepEqual(calls[0], { path: '/api/embed', body: { model: 'test-embed', input: 'Study this', truncate: false } });
  assert.equal(calls[1].path, '/api/generate');
  assert.equal(calls[1].body.model, 'test-chat');
  assert.equal(calls[1].body.stream, false);
});

test('Ollama network/HTTP/malformed outputs become safe service errors', async () => {
  const config = { ollamaUrl: 'http://localhost:11434', generationModel: 'chat', embeddingModel: 'embed' };
  for (const fakeFetch of [
    async () => { throw new Error('private connection info'); },
    async () => ({ ok: false }),
    async () => ({ ok: true, json: async () => { throw new Error('private JSON info'); } }),
  ]) {
    await assert.rejects(createOllama(config, fakeFetch).generate('Hi'), error => {
      assert.ok(error instanceof OllamaError);
      assert.doesNotMatch(error.message, /private/);
      return true;
    });
  }
  for (const embeddings of [[], [[0, 0]], [['not-a-number']], [[null]]]) {
    await assert.rejects(createOllama(config, async () => ({ ok: true, json: async () => ({ embeddings }) })).embed('Hi'), OllamaError);
  }
  await assert.rejects(createOllama(config, async () => ({ ok: true, json: async () => ({ response: '' }) })).generate('Hi'), OllamaError);
});

test('chunking preserves coverage and overlap, cosine ranking handles invalid dimensions', () => {
  const content = 'x'.repeat(4000);
  const chunks = chunkText(content);
  assert.equal(chunks.length, 4);
  assert.equal(chunks[0].length, 1200);
  assert.equal(chunks.at(-1).length, 850);
  assert.deepEqual(chunkText('short'), ['short']);
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([1], [1, 0]), -1);
  assert.equal(cosineSimilarity([0, 0], [1, 0]), -1);
});

test('configuration fails closed for missing/weak secrets and invalid ports or Ollama URLs', () => {
  for (const secret of [
    undefined, '', 'short', 'a'.repeat(64), 'change-me-012345678901234567890123456789',
    '1234567890123456789012345678901234567890', 'abcdefghijklmnop'.repeat(3),
    'replace-this-with-a-long-random-secret',
  ]) {
    assert.throws(() => validateSecret(secret), /JWT_SECRET/);
  }
  const strong = 'test-only-strong-key-0123456789-abcdef';
  assert.equal(loadConfig({ JWT_SECRET: strong }).port, 3001);
  assert.throws(() => loadConfig({ JWT_SECRET: strong, PORT: 'abc' }), /PORT/);
  assert.throws(() => loadConfig({ JWT_SECRET: strong, OLLAMA_URL: 'file:///etc' }), /OLLAMA_URL/);
});
