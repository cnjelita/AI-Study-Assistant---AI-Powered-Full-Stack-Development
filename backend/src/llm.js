export async function ollama(endpoint, body) {
  const response = await fetch(`${process.env.ollamaUrl}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Ollama ${endpoint} failed with status ${response.status}`);
  return response.json();
}

export async function chat(instructions, input) {
  const results = await ollama('/api/chat', {
    model: process.env.chatModel,
    format: 'json',
    stream: false,
    messages: [
      { role: 'system', content: instructions },
      { role: 'user', content: JSON.stringify(input) },
    ],
    options: { temperature: 0 },
  });
  return JSON.parse(results.message.content);
}
