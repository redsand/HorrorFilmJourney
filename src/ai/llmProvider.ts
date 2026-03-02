export type LlmProviderName = 'gemini' | 'ollama' | 'unknown';

export type GenerateJsonArgs = {
  system: string;
  user: string;
  schemaName: string;
  jsonSchema: object;
  temperature?: number;
  maxTokens?: number;
};

export interface LlmProvider {
  name(): LlmProviderName;
  generateJson<T>(args: GenerateJsonArgs): Promise<T>;
}

const DEFAULT_GEMINI_MODEL = 'gemini-1.5-flash';
const DEFAULT_OLLAMA_HOST = 'http://localhost:11434';
const DEFAULT_LLM_TIMEOUT_MS = 20_000;

export class LlmSchemaError extends Error {
  code = 'LLM_SCHEMA_ERROR' as const;

  constructor(message: string) {
    super(message);
    this.name = 'LlmSchemaError';
  }
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new LlmSchemaError('LLM returned empty response text');
  }

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  const candidate = first >= 0 && last > first ? trimmed.slice(first, last + 1) : trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    throw new LlmSchemaError('LLM returned invalid JSON');
  }
}

function validateBySchemaShape(value: unknown, schema: object): void {
  const schemaRecord = schema as Record<string, unknown>;
  const required = Array.isArray(schemaRecord.required) ? schemaRecord.required.filter((item): item is string => typeof item === 'string') : [];

  if (value === null || typeof value !== 'object') {
    throw new LlmSchemaError('LLM JSON is not an object');
  }

  const obj = value as Record<string, unknown>;
  const missing = required.filter((key) => !(key in obj));
  if (missing.length > 0) {
    throw new LlmSchemaError(`LLM JSON missing required keys: ${missing.join(', ')}`);
  }
}

function buildInstruction(args: GenerateJsonArgs): string {
  return [
    `You are a JSON API for schema: ${args.schemaName}.`,
    'Return only strict JSON. No markdown, no prose.',
    `JSON Schema: ${JSON.stringify(args.jsonSchema)}`,
    `System context: ${args.system}`,
    `User request: ${args.user}`,
  ].join('\n');
}

function llmTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.LLM_TIMEOUT_MS ?? '', 10);
  if (Number.isInteger(parsed) && parsed >= 2_000) {
    return parsed;
  }
  return DEFAULT_LLM_TIMEOUT_MS;
}

export class GeminiProvider implements LlmProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL,
  ) {}

  name(): LlmProviderName {
    return 'gemini';
  }

  async generateJson<T>(args: GenerateJsonArgs): Promise<T> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const startedAt = Date.now();
    const response = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(llmTimeoutMs()),
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        generationConfig: {
          temperature: args.temperature ?? 0.2,
          maxOutputTokens: args.maxTokens ?? 1024,
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: buildInstruction(args) }],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini request failed with status ${response.status}`);
    }

    const body = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string') {
      throw new LlmSchemaError('Gemini response did not include text content');
    }

    const parsed = extractJsonObject(text);
    validateBySchemaShape(parsed, args.jsonSchema);
    console.info('[llm.gemini] completed', { durationMs: Date.now() - startedAt });
    return parsed as T;
  }
}

export class OllamaProvider implements LlmProvider {
  constructor(
    private readonly model: string,
    private readonly host: string = process.env.OLLAMA_HOST ?? DEFAULT_OLLAMA_HOST,
  ) {}

  name(): LlmProviderName {
    return 'ollama';
  }

  async generateJson<T>(args: GenerateJsonArgs): Promise<T> {
    const baseUrl = this.host.replace(/\/$/, '');
    const generateUrl = `${baseUrl}/api/generate`;
    const startedAt = Date.now();
    const response = await fetch(generateUrl, {
      method: 'POST',
      signal: AbortSignal.timeout(llmTimeoutMs()),
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        prompt: buildInstruction(args),
        stream: false,
        options: {
          temperature: args.temperature ?? 0.2,
          num_predict: args.maxTokens ?? 1024,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed with status ${response.status}`);
    }

    const body = (await response.json()) as { response?: string };
    if (typeof body.response === 'string' && body.response.trim().length > 0) {
      const parsed = extractJsonObject(body.response);
      validateBySchemaShape(parsed, args.jsonSchema);
      console.info('[llm.ollama] generate completed', { durationMs: Date.now() - startedAt });
      return parsed as T;
    }

    // Fallback path: some Ollama/cloud model responses can return empty `response` in /api/generate.
    // Retry using /api/chat with explicit JSON schema format.
    const chatUrl = `${baseUrl}/api/chat`;
    const chatResponse = await fetch(chatUrl, {
      method: 'POST',
      signal: AbortSignal.timeout(llmTimeoutMs()),
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        messages: [
          { role: 'system', content: args.system },
          { role: 'user', content: buildInstruction(args) },
        ],
        format: args.jsonSchema,
        options: {
          temperature: args.temperature ?? 0.2,
          num_predict: args.maxTokens ?? 1024,
        },
      }),
    });

    if (!chatResponse.ok) {
      throw new Error(`Ollama chat fallback failed with status ${chatResponse.status}`);
    }

    const chatBody = (await chatResponse.json()) as { message?: { content?: string } };
    const content = chatBody.message?.content;
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new LlmSchemaError('Ollama response did not include response text');
    }

    const parsed = extractJsonObject(content);
    validateBySchemaShape(parsed, args.jsonSchema);
    console.info('[llm.ollama] chat fallback completed', { durationMs: Date.now() - startedAt });
    return parsed as T;
  }
}
