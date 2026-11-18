import type { z } from "zod";

/**
 * Provider-agnostic LLM interface. Implement one adapter per provider
 * (Anthropic, OpenAI, local, ...) and select via AI_PROVIDER env var.
 */
export interface LLMClient {
  /** Structured output validated against a Zod schema. */
  generateObject<T>(args: {
    system: string;
    prompt: string;
    schema: z.ZodType<T>;
    maxTokens?: number;
  }): Promise<T>;
  generateText(args: { system: string; prompt: string; maxTokens?: number }): Promise<string>;
}

export function getLLM(): LLMClient | null {
  const provider = process.env.AI_PROVIDER;
  if (!provider) return null; // pipeline runs with heuristic fallbacks
  // TODO: add adapters in lib/ai/providers/<name>.ts and switch on `provider`.
  throw new Error(`AI_PROVIDER "${provider}" has no adapter yet (see lib/ai/client.ts)`);
}
