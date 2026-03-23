import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";

const nullableString = v.union(v.string(), v.null());

export const listByThread = queryGeneric({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chat_messages")
      .withIndex("by_thread_created", (q) => q.eq("threadId", args.threadId))
      .collect();
  },
});

export const append = mutationGeneric({
  args: {
    messages: v.array(
      v.object({
        id: v.string(),
        threadId: v.string(),
        role: v.union(v.literal("system"), v.literal("user"), v.literal("assistant"), v.literal("tool")),
        parts: v.any(),
        visible: v.boolean(),
        createdAt: v.number(),
        runId: v.optional(nullableString),
        toolName: v.optional(nullableString),
      }),
    ),
  },
  handler: async (ctx, args) => {
    let latestByThread = new Map<string, number>();

    for (const message of args.messages) {
      await ctx.db.insert("chat_messages", {
        ...message,
        runId: message.runId ?? null,
        toolName: message.toolName ?? null,
      });
      latestByThread.set(message.threadId, Math.max(latestByThread.get(message.threadId) ?? 0, message.createdAt));
    }

    for (const [threadId, updatedAt] of latestByThread.entries()) {
      const thread = await ctx.db.query("chat_threads").withIndex("by_thread_id", (q) => q.eq("id", threadId)).first();
      if (!thread) continue;
      await ctx.db.patch(thread._id, { updatedAt });
    }
  },
});
