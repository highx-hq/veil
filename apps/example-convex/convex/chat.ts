import { createFunctionHandle } from "convex/server";
import { v } from "convex/values";

import { api, components } from "./_generated/api";
import { action, query } from "./_generated/server";

const CHAT_MODEL = "gemini-2.5-flash";
type ToolKind = "query" | "mutation" | "action";
type RuntimeToolDefinition = {
  name: string;
  description: string;
  kind: ToolKind;
  handler: string;
  inputSchema: Record<string, unknown>;
};

export const listMessages = query({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.runQuery(components.veil.chat.listMessages, { threadId: args.threadId });
    return messages.filter((message: any) => message.visible);
  },
});

export const createThread = action({
  args: {
    userId: v.string(),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.runAction(components.veil.chat.createThread, {
      userId: args.userId,
      title: args.title,
      metadata: {
        source: "example-convex",
      },
    });
  },
});

export const respond = action({
  args: {
    threadId: v.string(),
    userId: v.string(),
    message: v.string(),
  },
  handler: async (ctx, args): Promise<{ runId: string; threadId: string; text: string }> => {
    const apiKey = process.env.GEMINI_KEY;
    if (!apiKey) throw new Error("Missing GEMINI_KEY");

    return await ctx.runAction(components.veil.chat.respond, {
      threadId: args.threadId,
      userId: args.userId,
      message: args.message,
      geminiApiKey: apiKey,
      model: CHAT_MODEL,
      systemPrompt: "You are a shopping assistant for Veil's example Convex store.",
      platformContext: {
        platformName: "Veil Demo Shop",
        currency: "USD",
        shippingRegions: ["BD", "US", "CA", "UK"],
        orderPolicy: "Orders placed through tools are simulated and stored in the demo orders table.",
      },
      toolPolicy: "snapshot-first",
      tools: await resolveChatTools(),
    });
  },
});

async function resolveChatTools(): Promise<RuntimeToolDefinition[]> {
  const localTools: RuntimeToolDefinition[] = [
    {
      name: "search_products",
      description: "Search the active product catalog for fresh matches beyond the snapshot.",
      kind: "query" as const,
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
      kind: "query" as const,
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
  ];

  const pluginToolPack: RuntimeToolDefinition[] = [
    {
      name: "place_order",
      description: "Create a demo order for a product. Use this before claiming an order was placed.",
      kind: "mutation" as const,
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
      kind: "query" as const,
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
  ];

  return [...localTools, ...pluginToolPack];
}
