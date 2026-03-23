import { components, internal } from "./_generated/api";
import { createDevtoolsHttpRouter } from "@veil/veil-convex/devtools/http";

const devtoolsHttp = createDevtoolsHttpRouter({
  authEnabled: false,
  component: components.veil,
  geminiApiKey: () => process.env.GEMINI_KEY,
  defaultUserId: "demo",
  loadItems: async ({ runQuery }: { runQuery: any }): Promise<any[]> =>
    runQuery(internal.items.listActive, {}),
  defaultSettings: {
    models: {
      recommendation: "gemini-2.5-flash",
      chat: "gemini-2.5-flash",
      summary: "gemini-2.5-flash",
    },
    prompts: {
      recommendation: `
You are a general-purpose e-commerce recommendation engine.
Prioritize items that are well-rated and recently relevant.
Avoid near-duplicates, keep category diversity when possible.
      `.trim(),
      chat: "You are a helpful shopping assistant. Help users find products they'll love.",
    },
    filters: {
      categories: "electronics, books, clothing",
      priceMin: 0,
      priceMax: 500,
    },
    cache: {
      refreshCron: "0 */6 * * *",
      maxItems: 200,
      kvBinding: "VEIL_KV",
      queueBinding: "VEIL_QUEUE",
    },
    features: {
      recency: 20,
      popularity: 30,
      rating: 35,
      price: 15,
    },
    toggles: {
      cache: true,
      autocompletion: true,
      groupByCategory: true,
      backgroundRefresh: true,
      diversity: true,
      priceRange: true,
      webPlugin: true,
      reviewsPlugin: true,
      socialPlugin: false,
    },
  },
});

export default devtoolsHttp;
