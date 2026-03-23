import { createFunctionHandle } from "convex/server";
import { components, internal } from "./_generated/api";
import { createDevtoolsHttpRouter } from "@veil/veil-convex/devtools/http";
import { api } from "./_generated/api";

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
  chat: {
    platformContext: {
      platformName: "Veil Demo Shop",
      currency: "USD",
      shippingRegions: ["BD", "US", "CA", "UK"],
      orderPolicy: "Orders placed through tools are simulated and stored in the demo orders table.",
    },
    toolPolicy: "snapshot-first",
    createTools: async () => [
      {
        name: "search_products",
        description: "Search the active product catalog for fresh matches beyond the snapshot.",
        kind: "query",
        handler: await createFunctionHandle(api.chat_tools.searchProducts),
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            category: { type: "string" },
            maxPrice: { type: "number" },
            limit: { type: "number" },
          },
          required: ["query"],
          additionalProperties: false,
        },
      },
      {
        name: "get_product_details",
        description: "Fetch complete details for a specific product by itemId.",
        kind: "query",
        handler: await createFunctionHandle(api.chat_tools.getProductDetails),
        inputSchema: {
          type: "object",
          properties: {
            itemId: { type: "string" },
          },
          required: ["itemId"],
          additionalProperties: false,
        },
      },
      {
        name: "place_order",
        description: "Create a demo order for a product. Use this before claiming an order was placed.",
        kind: "mutation",
        handler: await createFunctionHandle(api.chat_tools.placeOrder),
        inputSchema: {
          type: "object",
          properties: {
            userId: { type: "string" },
            itemId: { type: "string" },
            quantity: { type: "number" },
          },
          required: ["userId", "itemId", "quantity"],
          additionalProperties: false,
        },
      },
      {
        name: "get_shipping_quote",
        description: "Estimate shipping fee and delivery time for a region.",
        kind: "query",
        handler: await createFunctionHandle(api.chat_tools.getShippingQuote),
        inputSchema: {
          type: "object",
          properties: {
            region: { type: "string" },
            itemId: { type: "string" },
          },
          required: ["region"],
          additionalProperties: false,
        },
      },
    ],
  },
});

export default devtoolsHttp;
