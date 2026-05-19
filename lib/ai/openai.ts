import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { z } from "zod";

export const MODEL = "gpt-4.1-mini";

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 30_000,
      maxRetries: 2,
    });
  }
  return _openai;
}

export async function structuredCompletion<T extends z.ZodType>(
  schema: T,
  schemaName: string,
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  options?: { cacheKey?: string }
): Promise<z.infer<T>> {
  const response = await getOpenAI().chat.completions.parse({
    model: MODEL,
    messages,
    response_format: zodResponseFormat(schema, schemaName),
    ...(options?.cacheKey
      ? { prompt_cache_key: options.cacheKey }
      : {}),
  });

  const parsed = response.choices[0]?.message?.parsed;
  if (!parsed) {
    throw new Error("Failed to parse structured OpenAI response");
  }
  return parsed;
}
