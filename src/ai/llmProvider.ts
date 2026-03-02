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

function isTimeoutLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const name = error.name.toLowerCase();
  const message = error.message.toLowerCase();
  return name.includes('abort') || name.includes('timeout') || message.includes('timed out') || message.includes('timeout');
}

async function fetchJsonWithTimeoutRetry(url: string, init: RequestInit, baseTimeoutMs: number, label: string): Promise<unknown> {
  try {
    const first = await fetch(url, { ...init, signal: AbortSignal.timeout(baseTimeoutMs) });
    if (!first.ok) {
      throw new Error(`${label} failed with status ${first.status}`);
    }
    return await first.json() as unknown;
  } catch (error) {
    if (!isTimeoutLikeError(error)) {
      throw error;
    }
    const retryTimeoutMs = baseTimeoutMs * 2;
    console.warn('[llm] timeout retry', { label, baseTimeoutMs, retryTimeoutMs });
    const second = await fetch(url, { ...init, signal: AbortSignal.timeout(retryTimeoutMs) });
    if (!second.ok) {
      throw new Error(`${label} failed with status ${second.status}`);
    }
    return await second.json() as unknown;
  }
}

function extractToolCallArguments(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const toolCalls = Array.isArray(record.tool_calls) ? record.tool_calls : [];
  const firstCall = toolCalls[0];
  if (!firstCall || typeof firstCall !== 'object') {
    return null;
  }
  const functionObj = (firstCall as Record<string, unknown>).function;
  if (!functionObj || typeof functionObj !== 'object') {
    return null;
  }
  const args = (functionObj as Record<string, unknown>).arguments;
  return typeof args === 'string' && args.trim().length > 0 ? args : null;
}

function extractTextFromOllamaBody(body: unknown): string | null {
  if (!body || typeof body !== 'object') {
    return null;
  }
  const record = body as Record<string, unknown>;
  const directResponse = record.response;
  if (typeof directResponse === 'string' && directResponse.trim().length > 0) {
    return directResponse;
  }
  const outputText = record.output_text;
  if (typeof outputText === 'string' && outputText.trim().length > 0) {
    return outputText;
  }

  const message = record.message;
  if (message && typeof message === 'object') {
    const messageRecord = message as Record<string, unknown>;
    const content = messageRecord.content;
    if (typeof content === 'string' && content.trim().length > 0) {
      return content;
    }
    const toolArgs = extractToolCallArguments(messageRecord);
    if (toolArgs) {
      return toolArgs;
    }
  }

  const choices = Array.isArray(record.choices) ? record.choices : [];
  const firstChoice = choices[0];
  if (firstChoice && typeof firstChoice === 'object') {
    const choiceRecord = firstChoice as Record<string, unknown>;
    const text = choiceRecord.text;
    if (typeof text === 'string' && text.trim().length > 0) {
      return text;
    }
    const choiceMessage = choiceRecord.message;
    if (choiceMessage && typeof choiceMessage === 'object') {
      const choiceMessageRecord = choiceMessage as Record<string, unknown>;
      const content = choiceMessageRecord.content;
      if (typeof content === 'string' && content.trim().length > 0) {
        return content;
      }
      const toolArgs = extractToolCallArguments(choiceMessageRecord);
      if (toolArgs) {
        return toolArgs;
      }
    }
  }

  return null;
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
    const timeoutMs = llmTimeoutMs();
    const generateRequestInit: RequestInit = {
      method: 'POST',
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
    };
    const body = await fetchJsonWithTimeoutRetry(generateUrl, generateRequestInit, timeoutMs, 'Ollama request');
    const generateText = extractTextFromOllamaBody(body);
    if (generateText) {
      const parsed = extractJsonObject(generateText);
      validateBySchemaShape(parsed, args.jsonSchema);
      console.info('[llm.ollama] generate completed', { durationMs: Date.now() - startedAt });
      return parsed as T;
    }

    // Fallback path: some Ollama/cloud model responses can return empty `response` in /api/generate.
    // Retry using /api/chat with explicit JSON schema format.
    const chatUrl = `${baseUrl}/api/chat`;
    const chatRequestInit: RequestInit = {
      method: 'POST',
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
    };
    const chatBody = await fetchJsonWithTimeoutRetry(chatUrl, chatRequestInit, timeoutMs, 'Ollama chat fallback');
    const content = extractTextFromOllamaBody(chatBody);
    if (!content) {
      throw new LlmSchemaError('Ollama response did not include response text');
    }

    const parsed = extractJsonObject(content);
    validateBySchemaShape(parsed, args.jsonSchema);
    console.info('[llm.ollama] chat fallback completed', { durationMs: Date.now() - startedAt });
    return parsed as T;
  }
}
