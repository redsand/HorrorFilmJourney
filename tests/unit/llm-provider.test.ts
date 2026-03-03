import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLlmProviderFromEnv } from '@/ai';
import { GeminiProvider, LlmSchemaError, OllamaProvider } from '@/ai/llmProvider';

const originalEnv = { ...process.env };

describe('getLlmProviderFromEnv', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns GeminiProvider when env is configured', () => {
    process.env.LLM_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.GEMINI_MODEL = 'gemini-1.5-flash';

    const provider = getLlmProviderFromEnv();
    expect(provider).toBeInstanceOf(GeminiProvider);
    expect(provider.name()).toBe('gemini');
  });

  it('returns OllamaProvider when env is configured', () => {
    process.env.LLM_PROVIDER = 'ollama';
    process.env.OLLAMA_MODEL = 'llama3.1:8b';
    process.env.OLLAMA_HOST = 'http://localhost:11434';

    const provider = getLlmProviderFromEnv();
    expect(provider).toBeInstanceOf(OllamaProvider);
    expect(provider.name()).toBe('ollama');
  });

  it('throws clear errors for missing required env vars', () => {
    process.env.LLM_PROVIDER = 'gemini';
    delete process.env.GEMINI_API_KEY;
    expect(() => getLlmProviderFromEnv()).toThrow('LLM_PROVIDER=gemini requires GEMINI_API_KEY');

    process.env.LLM_PROVIDER = 'ollama';
    delete process.env.OLLAMA_MODEL;
    expect(() => getLlmProviderFromEnv()).toThrow('LLM_PROVIDER=ollama requires OLLAMA_MODEL');
  });
});

describe('provider request building and schema errors', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('builds Gemini fetch URL and payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '{"answer":"ok"}' }] } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new GeminiProvider('gem-key', 'gemini-test');
    const result = await provider.generateJson<{ answer: string }>({
      system: 'system',
      user: 'user',
      schemaName: 'TestSchema',
      jsonSchema: { type: 'object', required: ['answer'] },
      temperature: 0.1,
      maxTokens: 300,
    });

    expect(result).toEqual({ answer: 'ok' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(url).toContain('gemini-test:generateContent');
    const payload = JSON.parse(String(init.body));
    expect(payload.generationConfig.temperature).toBe(0.1);
    expect(payload.generationConfig.maxOutputTokens).toBe(300);
    expect(payload.contents[0].parts[0].text).toContain('TestSchema');
  });

  it('parses Gemini JSON when wrapped in markdown code fences', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '```json\n{"answer":"ok-fenced"}\n```' }] } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new GeminiProvider('gem-key', 'gemini-test');
    const result = await provider.generateJson<{ answer: string }>({
      system: 'system',
      user: 'user',
      schemaName: 'TestSchema',
      jsonSchema: { type: 'object', required: ['answer'] },
    });

    expect(result).toEqual({ answer: 'ok-fenced' });
  });

  it('parses Gemini JSON split across multiple parts', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{
          finishReason: 'STOP',
          content: {
            parts: [
              { text: '{"answer":"ok' },
              { text: '-multi-part"}' },
            ],
          },
        }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new GeminiProvider('gem-key', 'gemini-test');
    const result = await provider.generateJson<{ answer: string }>({
      system: 'system',
      user: 'user',
      schemaName: 'TestSchema',
      jsonSchema: { type: 'object', required: ['answer'] },
    });

    expect(result).toEqual({ answer: 'ok-multi-part' });
  });

  it('builds Ollama fetch URL and payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: '{"answer":"ok"}' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OllamaProvider('llama3.1:8b', 'http://localhost:11434');
    const result = await provider.generateJson<{ answer: string }>({
      system: 'system',
      user: 'user',
      schemaName: 'TestSchema',
      jsonSchema: { type: 'object', required: ['answer'] },
    });

    expect(result).toEqual({ answer: 'ok' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:11434/api/generate');
    const payload = JSON.parse(String(init.body));
    expect(payload.model).toBe('llama3.1:8b');
    expect(payload.stream).toBe(false);
    expect(payload.options.num_predict).toBe(1024);
  });

  it('falls back to /api/chat when /api/generate returns empty response text', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: '' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: { content: '{"answer":"ok-from-chat"}' } }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OllamaProvider('glm-5:cloud', 'http://localhost:11434');
    const result = await provider.generateJson<{ answer: string }>({
      system: 'system',
      user: 'user',
      schemaName: 'TestSchema',
      jsonSchema: { type: 'object', required: ['answer'] },
    });

    expect(result).toEqual({ answer: 'ok-from-chat' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [firstUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [secondUrl] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(firstUrl).toBe('http://localhost:11434/api/generate');
    expect(secondUrl).toBe('http://localhost:11434/api/chat');
  });

  it('falls back to /api/chat when /api/generate returns non-JSON thinking text', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: '',
          thinking: 'Analyze request and produce JSON next',
          done_reason: 'length',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: { content: '{"answer":"ok-from-chat-after-thinking"}' } }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OllamaProvider('glm-5:cloud', 'http://localhost:11434');
    const result = await provider.generateJson<{ answer: string }>({
      system: 'system',
      user: 'user',
      schemaName: 'TestSchema',
      jsonSchema: { type: 'object', required: ['answer'] },
    });

    expect(result).toEqual({ answer: 'ok-from-chat-after-thinking' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries once with doubled timeout when Ollama request times out', async () => {
    const timeoutError = new Error('The operation timed out');
    timeoutError.name = 'TimeoutError';
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(timeoutError)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: '{"answer":"ok-after-timeout-retry"}' }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OllamaProvider('glm-5:cloud', 'http://localhost:11434');
    const result = await provider.generateJson<{ answer: string }>({
      system: 'system',
      user: 'user',
      schemaName: 'TestSchema',
      jsonSchema: { type: 'object', required: ['answer'] },
    });

    expect(result).toEqual({ answer: 'ok-after-timeout-retry' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws LLM_SCHEMA_ERROR when provider returns invalid JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: 'not-json' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OllamaProvider('llama3.1:8b', 'http://localhost:11434');
    await expect(
      provider.generateJson({
        system: 'system',
        user: 'user',
        schemaName: 'Schema',
        jsonSchema: { type: 'object', required: ['answer'] },
      }),
    ).rejects.toMatchObject({ code: 'LLM_SCHEMA_ERROR' });
  });

  it('throws LLM_SCHEMA_ERROR when schema required key is missing', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '{"other":"x"}' }] } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new GeminiProvider('gem-key', 'gemini-test');
    await expect(
      provider.generateJson({
        system: 'system',
        user: 'user',
        schemaName: 'Schema',
        jsonSchema: { type: 'object', required: ['answer'] },
      }),
    ).rejects.toBeInstanceOf(LlmSchemaError);
  });
});
