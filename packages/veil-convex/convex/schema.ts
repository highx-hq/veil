import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  kv: defineTable({
    key: v.string(),
    value: v.string(),
    expiresAt: v.optional(v.number()),
  }).index("by_key", ["key"]),

  feedback: defineTable({
    userId: v.string(),
    itemId: v.string(),
    event: v.union(v.literal("view"), v.literal("click"), v.literal("purchase"), v.literal("skip"), v.literal("dwell"), v.literal("dislike")),
    score: v.number(),
    ts: v.number(),
    meta: v.optional(v.any()),
  })
    .index("by_ts", ["ts"])
    .index("by_user_ts", ["userId", "ts"]),
});
