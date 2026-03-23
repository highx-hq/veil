import { v } from "convex/values";
import { mutationGeneric, queryGeneric } from "convex/server";

export const get = queryGeneric({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const doc = await ctx.db.query("kv").withIndex("by_key", (q) => q.eq("key", args.key)).first();
    if (!doc) return { value: null as string | null };
    if (doc.expiresAt !== undefined && doc.expiresAt < Date.now()) return { value: null as string | null };
    return { value: doc.value };
  },
});

export const set = mutationGeneric({
  args: { key: v.string(), value: v.string(), ttlSeconds: v.union(v.number(), v.null()) },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("kv").withIndex("by_key", (q) => q.eq("key", args.key)).first();
    const expiresAt = args.ttlSeconds ? Date.now() + args.ttlSeconds * 1000 : undefined;

    if (existing) {
      await ctx.db.patch(existing._id, { value: args.value, expiresAt });
      return;
    }
    await ctx.db.insert("kv", { key: args.key, value: args.value, expiresAt });
  },
});

export const delete_ = mutationGeneric({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("kv").withIndex("by_key", (q) => q.eq("key", args.key)).first();
    if (!existing) return;
    await ctx.db.delete(existing._id);
  },
});

export const list = queryGeneric({
  args: { prefix: v.string() },
  handler: async (ctx, args) => {
    const docs = await ctx.db.query("kv").collect();
    const now = Date.now();
    return docs
      .filter((d) => (d.expiresAt === undefined || d.expiresAt >= now) && d.key.startsWith(args.prefix))
      .map((d) => d.key);
  },
});

export const writeSnapshots = mutationGeneric({
  args: {
    hard: v.string(),
    ranked: v.string(),
    chat: v.string(),
    meta: v.string(),
    groupByCategory: v.boolean(),
  },
  handler: async (ctx, args) => {
    const put = async (key: string, value: string) => {
      const existing = await ctx.db.query("kv").withIndex("by_key", (q) => q.eq("key", key)).first();
      if (existing) await ctx.db.patch(existing._id, { value, expiresAt: undefined });
      else await ctx.db.insert("kv", { key, value });
    };

    await put("snapshot:hard", args.hard);
    await put("snapshot:ranked", args.ranked);
    await put("snapshot:chat", args.chat);
    await put("snapshot:meta", args.meta);

    if (!args.groupByCategory) return;

    const hard = JSON.parse(args.hard) as Array<{ category: string }>;
    const grouped = new Map<string, unknown[]>();
    for (const item of hard) {
      const list = grouped.get(item.category);
      if (list) list.push(item);
      else grouped.set(item.category, [item]);
    }
    for (const [category, list] of grouped.entries()) {
      await put(`snapshot:hard:category:${category}`, JSON.stringify(list));
    }
  },
});
