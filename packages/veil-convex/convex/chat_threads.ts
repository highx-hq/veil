import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";

import { createChatId } from "@veil/core";

const nullableString = v.union(v.string(), v.null());
const nullableAny = v.union(v.any(), v.null());

export const create = mutationGeneric({
  args: {
    userId: v.optional(nullableString),
    title: v.optional(nullableString),
    metadata: v.optional(nullableAny),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const thread = {
      id: createChatId("thread"),
      userId: args.userId ?? null,
      status: "active" as const,
      title: args.title ?? null,
      createdAt: now,
      updatedAt: now,
      metadata: args.metadata ?? null,
    };
    await ctx.db.insert("chat_threads", thread);
    return thread;
  },
});

export const get = queryGeneric({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.query("chat_threads").withIndex("by_thread_id", (q) => q.eq("id", args.threadId)).first();
  },
});

export const list = queryGeneric({
  args: {
    userId: v.optional(nullableString),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const docs =
      args.userId != null
        ? await ctx.db.query("chat_threads").withIndex("by_user_updated", (q) => q.eq("userId", args.userId)).collect()
        : await ctx.db.query("chat_threads").collect();

    return docs
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  },
});

export const touch = mutationGeneric({
  args: { threadId: v.string(), updatedAt: v.number() },
  handler: async (ctx, args) => {
    const thread = await ctx.db.query("chat_threads").withIndex("by_thread_id", (q) => q.eq("id", args.threadId)).first();
    if (!thread) return;
    await ctx.db.patch(thread._id, { updatedAt: args.updatedAt });
  },
});
