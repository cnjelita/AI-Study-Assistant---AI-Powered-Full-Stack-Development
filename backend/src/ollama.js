export class OllamaError extends Error {}

export function validEmbedding(value) {
  return Array.isArray(value) && value.length > 0 && value.length <= 8192 &&
    value.every(number => Number.isFinite(number)) &&
    value.some(number => number !== 0);
}

export function createOllama({ ollamaUrl, generationModel, embeddingModel }, fetchImpl = fetch) {
  async function request(path, body) {
    try {
      const response = await fetchImpl(`${ollamaUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000),
      });
      if (!response.ok) throw new Error('Upstream request failed');
      return await response.json();
    } catch {
      throw new OllamaError('The local AI service is unavailable. Check Ollama and its models.');
    }
  }
  return {
    async embed(text) {
      const result = await request('/api/embed', { model: embeddingModel, input: text, truncate: false });
      const vector = result.embeddings?.[0];
      if (!validEmbedding(vector)) throw new OllamaError('The local AI service returned an invalid embedding.');
      return vector;
    },
    async generate(prompt) {
      const result = await request('/api/generate', {
        model: generationModel,
        prompt,
        stream: false,
        options: { num_predict: 1800 },
      });
      if (typeof result.response !== 'string' || !result.response.trim()) {
        throw new OllamaError('The local AI service returned an empty response.');
      }
      return result.response.trim();
    },
  };
}

export function chunkText(content, size = 1200, overlap = 150) {
  const chunks = [];
  for (let start = 0; start < content.length; start += size - overlap) {
    const text = content.slice(start, start + size).trim();
    if (text) chunks.push(text);
    if (start + size >= content.length) break;
  }
  return chunks;
}

export function cosineSimilarity(left, right) {
  if (!validEmbedding(left) || !validEmbedding(right) || left.length !== right.length) return -1;
  const magnitude = Math.hypot(...left) * Math.hypot(...right);
  return left.reduce((sum, value, index) => sum + value * right[index], 0) / magnitude;
}
