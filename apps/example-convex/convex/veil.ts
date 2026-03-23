import { ConvexError, v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

export const seedDemo: any = internalAction({
  args: {},
  handler: async (ctx) => ctx.runMutation(internal.items.seedDemo, {}),
});

export const runCycle: any = internalAction({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.runQuery(internal.items.listActive, {});
    const apiKey = process.env.GEMINI_KEY;
    if (!apiKey) throw new ConvexError("Missing GEMINI_KEY");

    if (!items.length) throw new ConvexError('Items can not be empty')

    await ctx.runAction(components.veil.cycle.run, {
      items,
      geminiApiKey: apiKey,
      userId: "demo",
      feedbackLimit: 200,
      config: {
        recommendation: {
          hard: {
            features: [
              { id: "recency", field: "recency", weight: 0.2, normalize: "minmax" },
              { id: "rating", field: "rating", weight: 0.35, normalize: "minmax" },
              { id: "price", field: "price", weight: 0.15, normalize: "minmax", direction: "desc" },
            ],
          },
          soft: `
You are a general-purpose e-commerce recommendation engine.
Prioritize items that are well-rated and recently relevant.
Avoid near-duplicates, keep category diversity when possible.
          `.trim(),
          max: 200,
          cache: true,
          groupByCategory: true,
        },
        models: {
          recommendation: "gemini-2.5-flash",
          chat: "gemini-2.5-flash",
        },
      },
    });

    return { ok: true };
  },
});

export const getRecommendations: any = internalAction({
  args: { region: v.string(), budget: v.number(), userId: v.string() },
  handler: async (
    ctx,
    args: { region: string; budget: number; userId: string },
  ) => {
    return ctx.runQuery(components.veil.recommend.get, {
      limit: 20,
      filter: {
        match: { "meta.region": args.region },
        range: { "meta.price": { max: args.budget } },
      },
    });
  },
});
