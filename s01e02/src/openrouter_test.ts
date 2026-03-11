import dotenv from 'dotenv';
import { resolve } from 'node:path';

// Ładowanie .env (root repo / poziom wyżej)
dotenv.config();
dotenv.config({ path: resolve(process.cwd(), '..', '.env') });
dotenv.config({ path: resolve(process.cwd(), '..', '..', '.env') });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Brak zmiennej środowiskowej ${name} (dodaj do .env w katalogu głównym repo).`);
  }
  return value.trim();
}

async function main() {
  const apiKey = requireEnv('OPENROUTER_API_KEY');

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://example.local', // można podmienić na swoją stronę / repo
      'X-Title': 'AI_DEVS4 S1E2 test'
    },
    body: JSON.stringify({
      model: 'openrouter/auto',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant.'
        },
        {
          role: 'user',
          content:
            'Odpowiedz jednym krótkim zdaniem po polsku, że połączenie z OpenRouter działa poprawnie.'
        }
      ]
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} przy wywołaniu OpenRouter\n${text}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  const content = json.choices?.[0]?.message?.content ?? '(brak treści w odpowiedzi)';
  console.log('Odpowiedź OpenRouter:');
  console.log(content);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

