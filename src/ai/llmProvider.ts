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

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidateFromFence = fenced?.[1]?.trim();
  if (candidateFromFence) {
    try {
      return JSON.parse(candidateFromFence);
    } catch {
      // continue to broader extraction
    }
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

function geminiDebugEnabled(): boolean {
  return process.env.GEMINI_DEBUG_SHAPE === 'true';
}

function normalizeSchemaForGemini(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeSchemaForGemini(item));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const record = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    // Gemini response_schema rejects this key in our current endpoint version.
    if (key === 'additionalProperties') {
      continue;
    }
    normalized[key] = normalizeSchemaForGemini(child);
  }
  return normalized;
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
  if (typeof args === 'string' && args.trim().length > 0) {
    return args;
  }
  if (args && typeof args === 'object') {
    try {
      return JSON.stringify(args);
    } catch {
      return null;
    }
  }
  return null;
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
  const directThinking = record.thinking;
  if (typeof directThinking === 'string' && directThinking.trim().length > 0) {
    return directThinking;
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
    const thinking = messageRecord.thinking;
    if (typeof thinking === 'string' && thinking.trim().length > 0) {
      return thinking;
    }
    const reasoningContent = messageRecord.reasoning_content;
    if (typeof reasoningContent === 'string' && reasoningContent.trim().length > 0) {
      return reasoningContent;
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
    const reasoningContent = choiceRecord.reasoning_content;
    if (typeof reasoningContent === 'string' && reasoningContent.trim().length > 0) {
      return reasoningContent;
    }
    const choiceMessage = choiceRecord.message;
    if (choiceMessage && typeof choiceMessage === 'object') {
      const choiceMessageRecord = choiceMessage as Record<string, unknown>;
      const content = choiceMessageRecord.content;
      if (typeof content === 'string' && content.trim().length > 0) {
        return content;
      }
      const thinking = choiceMessageRecord.thinking;
      if (typeof thinking === 'string' && thinking.trim().length > 0) {
        return thinking;
      }
      const choiceReasoningContent = choiceMessageRecord.reasoning_content;
      if (typeof choiceReasoningContent === 'string' && choiceReasoningContent.trim().length > 0) {
        return choiceReasoningContent;
      }
      const toolArgs = extractToolCallArguments(choiceMessageRecord);
      if (toolArgs) {
        return toolArgs;
      }
    }
  }

  return null;
}

function ollamaDebugEnabled(): boolean {
  return process.env.OLLAMA_DEBUG_SHAPE === 'true';
}

function clip(value: string, max = 220): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max)}...`;
}

function parseJsonOrThrow(text: string, errorMessage: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new LlmSchemaError(errorMessage);
  }
}

function collectGeminiText(body: unknown): {
  text: string;
  candidateCount: number;
  partCount: number;
  finishReason: string | null;
} {
  if (!body || typeof body !== 'object') {
    throw new LlmSchemaError('Gemini response body missing');
  }
  const record = body as Record<string, unknown>;
  const candidates = Array.isArray(record.candidates) ? record.candidates : [];
  const first = candidates[0];
  if (!first || typeof first !== 'object') {
    throw new LlmSchemaError('Gemini response did not include candidates');
  }
  const firstRecord = first as Record<string, unknown>;
  const finishReason = typeof firstRecord.finishReason === 'string' ? firstRecord.finishReason : null;
  const content = firstRecord.content;
  if (!content || typeof content !== 'object') {
    throw new LlmSchemaError('Gemini response did not include content');
  }
  const parts = Array.isArray((content as Record<string, unknown>).parts)
    ? (content as Record<string, unknown>).parts as unknown[]
    : [];
  const textParts = parts
    .map((part) => (part && typeof part === 'object' ? (part as Record<string, unknown>).text : null))
    .filter((value): value is string => typeof value === 'string');
  const text = textParts.join('');
  return {
    text,
    candidateCount: candidates.length,
    partCount: parts.length,
    finishReason,
  };
}

function summarizeOllamaBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') {
    return { type: typeof body };
  }
  const record = body as Record<string, unknown>;
  const message = record.message && typeof record.message === 'object' ? record.message as Record<string, unknown> : null;
  const topToolCalls = Array.isArray(record.tool_calls) ? record.tool_calls : [];
  const msgToolCalls = message && Array.isArray(message.tool_calls) ? message.tool_calls : [];
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const firstChoice = choices[0] && typeof choices[0] === 'object' ? choices[0] as Record<string, unknown> : null;
  const firstChoiceMessage = firstChoice?.message && typeof firstChoice.message === 'object'
    ? firstChoice.message as Record<string, unknown>
    : null;

  return {
    topLevelKeys: Object.keys(record).slice(0, 20),
    doneReason: typeof record.done_reason === 'string' ? record.done_reason : null,
    hasResponseText: typeof record.response === 'string' && record.response.trim().length > 0,
    responsePreview: typeof record.response === 'string' ? clip(record.response) : null,
    hasThinkingText: typeof record.thinking === 'string' && record.thinking.trim().length > 0,
    thinkingPreview: typeof record.thinking === 'string' ? clip(record.thinking) : null,
    hasOutputText: typeof record.output_text === 'string' && record.output_text.trim().length > 0,
    outputTextPreview: typeof record.output_text === 'string' ? clip(record.output_text) : null,
    hasMessageContent: typeof message?.content === 'string' && message.content.trim().length > 0,
    messageContentPreview: typeof message?.content === 'string' ? clip(message.content) : null,
    hasMessageThinking: typeof message?.thinking === 'string' && message.thinking.trim().length > 0,
    messageThinkingPreview: typeof message?.thinking === 'string' ? clip(message.thinking) : null,
    topToolCallCount: topToolCalls.length,
    messageToolCallCount: msgToolCalls.length,
    choiceCount: choices.length,
    hasFirstChoiceText: typeof firstChoice?.text === 'string' && firstChoice.text.trim().length > 0,
    firstChoiceTextPreview: typeof firstChoice?.text === 'string' ? clip(firstChoice.text) : null,
    hasFirstChoiceMessageContent: typeof firstChoiceMessage?.content === 'string' && firstChoiceMessage.content.trim().length > 0,
    firstChoiceMessageContentPreview: typeof firstChoiceMessage?.content === 'string' ? clip(firstChoiceMessage.content) : null,
  };
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
    const geminiSchema = normalizeSchemaForGemini(args.jsonSchema);
    const primaryPayload = {
      generationConfig: {
        temperature: args.temperature ?? 0.2,
        maxOutputTokens: args.maxTokens ?? 1024,
        responseMimeType: 'application/json',
        responseSchema: geminiSchema,
        // Compatibility aliases used by some gateways.
        response_mime_type: 'application/json',
        response_schema: geminiSchema,
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: buildInstruction(args) }],
        },
      ],
    };
    const compatPayload = {
      generationConfig: {
        temperature: args.temperature ?? 0.2,
        maxOutputTokens: args.maxTokens ?? 1024,
        responseMimeType: 'application/json',
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: buildInstruction(args) }],
        },
      ],
    };

    async function postGemini(payload: unknown): Promise<{
      ok: boolean;
      status: number;
      body: unknown;
      text: string;
    }> {
      const response = await fetch(url, {
        method: 'POST',
        signal: AbortSignal.timeout(llmTimeoutMs()),
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      let text = '';
      let body: unknown = null;
      if (typeof response.text === 'function') {
        text = await response.text();
        try {
          body = parseJsonOrThrow(text, 'Gemini response body was not valid JSON');
        } catch {
          body = null;
        }
      } else if (typeof response.json === 'function') {
        body = await response.json() as unknown;
        try {
          text = JSON.stringify(body);
        } catch {
          text = '';
        }
      }
      return { ok: response.ok, status: response.status, body, text };
    }

    let attempt = await postGemini(primaryPayload);
    if (!attempt.ok && attempt.status === 400) {
      console.warn('[llm.gemini] primary payload rejected, retrying compat payload', {
        status: attempt.status,
        errorPreview: attempt.text.slice(0, 300),
      });
      attempt = await postGemini(compatPayload);
    }
    if (!attempt.ok) {
      throw new Error(`Gemini request failed with status ${attempt.status}: ${attempt.text.slice(0, 300)}`);
    }

    const body = attempt.body as {
      promptFeedback?: unknown;
      usageMetadata?: unknown;
    };
    const collected = collectGeminiText(attempt.body);
    if (geminiDebugEnabled()) {
      console.info('[llm.gemini] shape', {
        topLevelKeys: Object.keys(body ?? {}).slice(0, 20),
        candidateCount: collected.candidateCount,
        partCount: collected.partCount,
        finishReason: collected.finishReason,
        hasPromptFeedback: Boolean(body?.promptFeedback),
      });
    }

    const text = collected.text;
    if (typeof text !== 'string') {
      throw new LlmSchemaError('Gemini response did not include text content');
    }

    let parsed: unknown;
    try {
      parsed = extractJsonObject(text);
    } catch (error) {
      console.warn('[llm.gemini] parse failed', {
        error: error instanceof Error ? error.message : 'unknown',
        finishReason: collected.finishReason,
        textPreview: text.slice(0, 320),
        textTail: text.slice(-180),
      });
      throw error;
    }
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

  private thinkOffOptions(): Record<string, unknown> {
    if (process.env.OLLAMA_ENABLE_THINKING === 'true') {
      return {
        think: true,
        thinking: true,
      };
    }
    return {
      think: false,
      thinking: false,
    };
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
          ...this.thinkOffOptions(),
        },
      }),
    };
    const body = await fetchJsonWithTimeoutRetry(generateUrl, generateRequestInit, timeoutMs, 'Ollama request');
    if (ollamaDebugEnabled()) {
      console.info('[llm.ollama] generate shape', summarizeOllamaBody(body));
    }
    const generateText = extractTextFromOllamaBody(body);
    if (generateText) {
      let parsed: unknown;
      try {
        parsed = extractJsonObject(generateText);
        validateBySchemaShape(parsed, args.jsonSchema);
        console.info('[llm.ollama] generate completed', { durationMs: Date.now() - startedAt });
        return parsed as T;
      } catch (error) {
        if (ollamaDebugEnabled()) {
          console.warn('[llm.ollama] generate parse failed', {
            error: error instanceof Error ? error.message : 'unknown',
            textPreview: clip(generateText),
            fallback: 'chat',
          });
        }
      }
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
        tools: [
          {
            type: 'function',
            function: {
              name: 'emit_json',
              description: `Return JSON for schema ${args.schemaName}`,
              parameters: args.jsonSchema,
            },
          },
        ],
        tool_choice: {
          type: 'function',
          function: { name: 'emit_json' },
        },
        options: {
          temperature: args.temperature ?? 0.2,
          num_predict: args.maxTokens ?? 1024,
          ...this.thinkOffOptions(),
        },
      }),
    };
    const chatBody = await fetchJsonWithTimeoutRetry(chatUrl, chatRequestInit, timeoutMs, 'Ollama chat fallback');
    if (ollamaDebugEnabled()) {
      console.info('[llm.ollama] chat shape', summarizeOllamaBody(chatBody));
    }
    const content = extractTextFromOllamaBody(chatBody);
    if (!content) {
      throw new LlmSchemaError('Ollama response did not include response text');
    }

    let parsed: unknown;
    try {
      parsed = extractJsonObject(content);
    } catch (error) {
      if (ollamaDebugEnabled()) {
        console.warn('[llm.ollama] chat parse failed', {
          error: error instanceof Error ? error.message : 'unknown',
          contentPreview: clip(content),
        });
      }
      throw error;
    }
    validateBySchemaShape(parsed, args.jsonSchema);
    console.info('[llm.ollama] chat fallback completed', { durationMs: Date.now() - startedAt });
    return parsed as T;
  }
}
