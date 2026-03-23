import { v } from "convex/values";
import { mutationGeneric, queryGeneric } from "convex/server";

export const record = mutationGeneric({
  args: {
    userId: v.string(),
    itemId: v.string(),
    event: v.union(
      v.literal("view"),
      v.literal("click"),
      v.literal("purchase"),
      v.literal("skip"),
      v.literal("dwell"),
      v.literal("dislike"),
    ),
    score: v.optional(v.number()),
    meta: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("feedback", {
      userId: args.userId,
      itemId: args.itemId,
      event: args.event,
      score: args.score ?? defaultScore(args.event),
      ts: Date.now(),
      meta: args.meta,
    });
  },
});

export const recent = queryGeneric({
  args: {
    userId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 100, 500);

    if (args.userId) {
      const docs = await ctx.db
        .query("feedback")
        .withIndex("by_user_ts", (q) => q.eq("userId", args.userId!))
        .order("desc")
        .take(limit);
      return docs.map(toVeilFeedback);
    }

    const docs = await ctx.db.query("feedback").withIndex("by_ts").order("desc").take(limit);
    return docs.map(toVeilFeedback);
  },
});

function toVeilFeedback(doc: any) {
  return {
    itemId: doc.itemId as string,
    event: doc.event as "view" | "click" | "purchase" | "skip" | "dwell" | "dislike",
    score: doc.score as number,
    ts: doc.ts as number,
    meta: doc.meta as Record<string, unknown> | undefined,
  };
}

function defaultScore(event: string): number {
  switch (event) {
    case "purchase":
      return 1.0;
    case "click":
      return 0.6;
    case "view":
      return 0.2;
    case "dwell":
      return 0.4;
    case "skip":
      return -0.2;
    case "dislike":
      return -1.0;
    default:
      return 0;
  }
}

