import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OllamaProvider } from '@/ai/llmProvider';
import { restoreTestFetch } from '../setup/no-network';

type HealthcheckShape = {
  title: string;
  bullets: [string, string, string];
};

function allowLocalNetworkOnly(): void {
  restoreTestFetch();
  const nativeFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawTarget = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

    const parsed = new URL(rawTarget);
    const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (!isLocal) {
      throw new Error(`Only local network calls are allowed in this test. Attempted: ${rawTarget}`);
    }

    return nativeFetch(input, init);
  }) as typeof fetch;
}

function readEnvFileValue(key: string): string | undefined {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) {
    return undefined;
  }

  const content = readFileSync(envPath, 'utf8');
  const line = content
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${key}=`));
  if (!line) {
    return undefined;
  }

  const rawValue = line.split('=', 2)[1]?.trim();
  if (!rawValue) {
    return undefined;
  }

  return rawValue.replace(/^"(.*)"$/, '$1');
}

type OllamaTagsResponse = {
  models?: Array<{ model?: string }>;
};

function isLocalTextModel(model: string): boolean {
  const lower = model.toLowerCase();
  if (lower.includes('cloud')) {
    return false;
  }
  if (lower.includes('flux') || lower.includes('vl') || lower.includes('vision')) {
    return false;
  }
  return true;
}

async function pickRunnableModel(host: string, preferred?: string): Promise<string> {
  if (preferred && isLocalTextModel(preferred)) {
    return preferred;
  }

  const response = await fetch(`${host.replace(/\/$/, '')}/api/tags`, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Failed to read Ollama tags from ${host}. Status ${response.status}`);
  }

  const payload = (await response.json()) as OllamaTagsResponse;
  const models = (payload.models ?? [])
    .map((entry) => entry.model)
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  const candidate = models.find((model) => isLocalTextModel(model));
  if (!candidate) {
    throw new Error(
      `No runnable local text model found in Ollama tags. Set OLLAMA_MODEL to a local model (not cloud). Found: ${models.join(', ')}`,
    );
  }

  return candidate;
}

describe('local Ollama provider integration', () => {
  it(
    'generates valid JSON from local Ollama',
    async () => {
      const preferredModel = process.env.OLLAMA_MODEL ?? readEnvFileValue('OLLAMA_MODEL');
      const host = process.env.OLLAMA_HOST ?? readEnvFileValue('OLLAMA_HOST') ?? 'http://localhost:11434';

      allowLocalNetworkOnly();
      const model = await pickRunnableModel(host, preferredModel);

      const provider = new OllamaProvider(model, host);
      const result = await provider.generateJson<HealthcheckShape>({
        schemaName: 'LocalOllamaHealthcheck',
        jsonSchema: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'bullets'],
          properties: {
            title: { type: 'string' },
            bullets: {
              type: 'array',
              minItems: 3,
              maxItems: 3,
              items: { type: 'string' },
            },
          },
        },
        system: 'Return strict JSON only.',
        user: 'Create a concise healthcheck payload for Horror Codex local test validation.',
        temperature: 0,
        maxTokens: 200,
      });

      expect(typeof result.title).toBe('string');
      expect(result.title.trim().length).toBeGreaterThan(0);
      expect(Array.isArray(result.bullets)).toBe(true);
      expect(result.bullets).toHaveLength(3);
      expect(result.bullets.every((line) => typeof line === 'string' && line.trim().length > 0)).toBe(true);
    },
    60000,
  );
});
