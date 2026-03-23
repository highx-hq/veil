import { v } from "convex/values";

import { mutation, query } from "./_generated/server";

export const searchProducts = query({
  args: {
    query: v.string(),
    category: v.optional(v.string()),
    maxPrice: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const docs = await ctx.db.query("items").collect();
    const needle = args.query.trim().toLowerCase();
    const limit = Math.max(1, Math.min(args.limit ?? 5, 20));

    return docs
      .filter((doc) => doc.active)
      .filter((doc) => !args.category || doc.category === args.category)
      .filter((doc) => args.maxPrice === undefined || (doc.meta?.price ?? Number.MAX_SAFE_INTEGER) <= args.maxPrice)
      .filter((doc) => {
        if (!needle) return true;
        const haystack = [doc.name, doc.category, ...(doc.tags ?? [])].join(" ").toLowerCase();
        return haystack.includes(needle);
      })
      .slice(0, limit)
      .map((doc) => ({
        itemId: doc.itemId,
        name: doc.name,
        category: doc.category,
        tags: doc.tags ?? [],
        meta: doc.meta,
      }));
  },
});

export const getProductDetails = query({
  args: {
    itemId: v.string(),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.query("items").withIndex("by_itemId", (q) => q.eq("itemId", args.itemId)).first();
    if (!doc) {
      return { found: false, itemId: args.itemId };
    }

    return {
      found: true,
      itemId: doc.itemId,
      name: doc.name,
      category: doc.category,
      tags: doc.tags ?? [],
      meta: doc.meta,
      active: doc.active,
    };
  },
});

export const placeOrder = mutation({
  args: {
    userId: v.string(),
    itemId: v.string(),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.query("items").withIndex("by_itemId", (q) => q.eq("itemId", args.itemId)).first();
    if (!item || !item.active) {
      return { ok: false, error: "Item not available", itemId: args.itemId };
    }

    const quantity = Math.max(1, Math.floor(args.quantity));
    const unitPrice = item.meta?.price ?? 0;
    const orderId = `order_${Math.random().toString(36).slice(2, 10)}`;

    await ctx.db.insert("orders", {
      orderId,
      userId: args.userId,
      itemId: args.itemId,
      quantity,
      unitPrice,
      totalPrice: unitPrice * quantity,
      status: "placed",
      createdAt: Date.now(),
    });

    return {
      ok: true,
      orderId,
      itemId: args.itemId,
      quantity,
      totalPrice: unitPrice * quantity,
      status: "placed",
    };
  },
});

export const getShippingQuote = query({
  args: {
    region: v.string(),
    itemId: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const region = args.region.toUpperCase();
    const quotes: Record<string, number> = {
      BD: 4,
      US: 12,
      CA: 14,
      UK: 16,
    };

    return {
      region,
      itemId: args.itemId ?? null,
      shippingFee: quotes[region] ?? 20,
      currency: "USD",
      estimatedDays: region === "BD" ? "1-2" : "5-10",
    };
  },
});

export const listOrders = query({
  args: {
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = args.userId;
    const docs = userId
      ? await ctx.db.query("orders").withIndex("by_user_created", (q) => q.eq("userId", userId)).collect()
      : await ctx.db.query("orders").collect();

    return docs
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((doc) => ({
        orderId: doc.orderId,
        userId: doc.userId,
        itemId: doc.itemId,
        quantity: doc.quantity,
        totalPrice: doc.totalPrice,
        status: doc.status,
        createdAt: doc.createdAt,
      }));
  },
});
