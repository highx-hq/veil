import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  kv: defineTable({
    key: v.string(),
    value: v.string(),
    expiresAt: v.optional(v.number()),
  }).index("by_key", ["key"]),

  chat_threads: defineTable({
    id: v.string(),
    userId: v.union(v.string(), v.null()),
    status: v.union(v.literal("active"), v.literal("archived")),
    title: v.union(v.string(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
    metadata: v.union(v.any(), v.null()),
  })
    .index("by_thread_id", ["id"])
    .index("by_user_updated", ["userId", "updatedAt"]),

  chat_messages: defineTable({
    id: v.string(),
    threadId: v.string(),
    role: v.union(v.literal("system"), v.literal("user"), v.literal("assistant"), v.literal("tool")),
    parts: v.any(),
    visible: v.boolean(),
    createdAt: v.number(),
    runId: v.union(v.string(), v.null()),
    toolName: v.union(v.string(), v.null()),
  })
    .index("by_thread_created", ["threadId", "createdAt"])
    .index("by_run_created", ["runId", "createdAt"]),

  chat_runs: defineTable({
    id: v.string(),
    threadId: v.string(),
    status: v.union(v.literal("running"), v.literal("completed"), v.literal("failed")),
    startedAt: v.number(),
    completedAt: v.union(v.number(), v.null()),
    snapshotKey: v.string(),
    snapshotVersion: v.union(v.string(), v.null()),
    toolPolicy: v.union(v.literal("snapshot-first"), v.literal("tool-heavy"), v.literal("snapshot-only")),
    metadata: v.union(v.any(), v.null()),
  })
    .index("by_run_id", ["id"])
    .index("by_thread_started", ["threadId", "startedAt"]),

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
