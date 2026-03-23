import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const docs = await ctx.db.query("items").collect();
    return docs.map((d) => ({
      _id: d._id,
      itemId: d.itemId,
      name: d.name,
      category: d.category,
      tags: d.tags ?? [],
      meta: d.meta,
      active: d.active,
    }));
  },
});

export const upsert = mutation({
  args: {
    itemId: v.optional(v.string()),
    name: v.string(),
    category: v.string(),
    tags: v.optional(v.array(v.string())),
    meta: v.object({ region: v.string(), price: v.number(), rating: v.number(), recency: v.number() }),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const itemId = args.itemId ?? `prod_${Math.random().toString(36).slice(2, 9)}`;
    const existing = await ctx.db.query("items").withIndex("by_itemId", (q) => q.eq("itemId", itemId)).first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        category: args.category,
        tags: args.tags,
        meta: args.meta,
        active: args.active,
      });
      return { itemId, updated: true };
    }

    await ctx.db.insert("items", {
      itemId,
      name: args.name,
      category: args.category,
      tags: args.tags,
      meta: args.meta,
      active: args.active,
    });
    return { itemId, created: true };
  },
});

export const remove = mutation({
  args: { itemId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("items").withIndex("by_itemId", (q) => q.eq("itemId", args.itemId)).first();
    if (!existing) return { ok: false };
    await ctx.db.delete(existing._id);
    return { ok: true };
  },
});

