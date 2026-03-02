import { GeminiProvider, OllamaProvider, type LlmProvider } from '@/ai/llmProvider';

export function getLlmProviderFromEnv(): LlmProvider {
  const provider = process.env.LLM_PROVIDER;

  if (provider === 'gemini') {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('LLM_PROVIDER=gemini requires GEMINI_API_KEY');
    }
    return new GeminiProvider(process.env.GEMINI_API_KEY, process.env.GEMINI_MODEL);
  }

  if (provider === 'ollama') {
    if (!process.env.OLLAMA_MODEL) {
      throw new Error('LLM_PROVIDER=ollama requires OLLAMA_MODEL');
    }
    return new OllamaProvider(process.env.OLLAMA_MODEL, process.env.OLLAMA_HOST);
  }

  throw new Error('LLM_PROVIDER must be one of: gemini, ollama');
}
