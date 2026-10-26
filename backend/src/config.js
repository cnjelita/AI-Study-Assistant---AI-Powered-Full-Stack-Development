export function validateSecret(secret) {
  if (typeof secret !== 'string' || secret.length < 32 ||
      new Set(secret).size < 12 ||
      /change.?me|your.?secret|example|placeholder|replace.?this|development.?secret/i.test(secret) ||
      Array.from({ length: 16 }, (_, index) => index + 1).some(size =>
        [...secret].every((character, index) => character === secret[index % size]))) {
    throw new Error('JWT_SECRET must be a strong, random secret of at least 32 characters.');
  }
  return secret;
}

export function loadConfig(env = process.env) {
  const port = Number(env.PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a valid TCP port.');
  }
  const ollamaUrl = new URL(env.OLLAMA_URL || 'http://127.0.0.1:11434');
  if (!['http:', 'https:'].includes(ollamaUrl.protocol) || ollamaUrl.username || ollamaUrl.password) {
    throw new Error('OLLAMA_URL must be an HTTP(S) URL without credentials.');
  }
  return {
    port,
    mongoUri: env.MONGODB_URI || 'mongodb://127.0.0.1:27017/study_assistant',
    jwtSecret: validateSecret(env.JWT_SECRET),
    ollamaUrl: ollamaUrl.href.replace(/\/$/, ''),
    generationModel: env.OLLAMA_MODEL || 'llama3.2',
    embeddingModel: env.OLLAMA_EMBED_MODEL || 'nomic-embed-text',
  };
}
