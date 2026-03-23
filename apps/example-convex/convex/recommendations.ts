import { v } from "convex/values";
import { action, query } from "./_generated/server";
import { components } from "./_generated/api";

export const list = query({
  args: {
    region: v.optional(v.string()),
    budget: v.optional(v.number()),
    limit: v.optional(v.number()),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const filter: any = {};
    if (args.region) filter.match = { "meta.region": args.region };
    if (args.budget !== undefined) filter.range = { "meta.price": { max: args.budget } };

    return ctx.runQuery(components.veil.recommend.get, {
      limit: args.limit ?? 20,
      filter: Object.keys(filter).length ? filter : undefined,
    });
  },
});

export const runCycle = action({
  args: {
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.GEMINI_KEY;
    if (!apiKey) throw new Error("Missing GEMINI_KEY");

    const docs = await ctx.runQuery("products:list" as any, {});
    const items = (docs as any[])
      .filter((d) => d.active)
      .map((d) => ({
        id: d.itemId,
        name: d.name,
        category: d.category,
        tags: d.tags ?? [],
        meta: d.meta,
      }));

    return ctx.runAction(components.veil.cycle.run, {
      items,
      geminiApiKey: apiKey,
      userId: args.userId,
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
Use user feedback signals: boost clicked/purchased items and de-rank disliked items.
Prioritize items that are well-rated and recently relevant.
Avoid near-duplicates and keep category diversity when possible.
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
  },
});
