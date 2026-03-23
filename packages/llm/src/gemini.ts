import { createGoogleGenerativeAI } from "@ai-sdk/google";

import type { VeilLanguageModel } from "@veil/core";

export function gemini(model: string, options?: { apiKey?: string }): VeilLanguageModel {
  const provider = createGoogleGenerativeAI({ apiKey: options?.apiKey });
  return provider(model);
}

