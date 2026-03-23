import { mutationGeneric } from "convex/server";
import { v } from "convex/values";

import { createChatId } from "@veil/core";

const nullableString = v.union(v.string(), v.null());
const nullableAny = v.union(v.any(), v.null());

export const create = mutationGeneric({
  args: {
    threadId: v.string(),
    snapshotKey: v.string(),
    snapshotVersion: v.optional(nullableString),
    toolPolicy: v.union(v.literal("snapshot-first"), v.literal("tool-heavy"), v.literal("snapshot-only")),
    metadata: v.optional(nullableAny),
  },
  handler: async (ctx, args) => {
    const run = {
      id: createChatId("run"),
      threadId: args.threadId,
      status: "running" as const,
      startedAt: Date.now(),
      completedAt: null as number | null,
      snapshotKey: args.snapshotKey,
      snapshotVersion: args.snapshotVersion ?? null,
      toolPolicy: args.toolPolicy,
      metadata: args.metadata ?? null,
    };
    await ctx.db.insert("chat_runs", run);
    return run;
  },
});

export const complete = mutationGeneric({
  args: {
    runId: v.string(),
    metadata: v.optional(nullableAny),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.query("chat_runs").withIndex("by_run_id", (q) => q.eq("id", args.runId)).first();
    if (!run) return;
    await ctx.db.patch(run._id, {
      status: "completed",
      completedAt: Date.now(),
      metadata: mergeMetadata(run.metadata, args.metadata),
    });
  },
});

export const fail = mutationGeneric({
  args: {
    runId: v.string(),
    metadata: v.optional(nullableAny),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.query("chat_runs").withIndex("by_run_id", (q) => q.eq("id", args.runId)).first();
    if (!run) return;
    await ctx.db.patch(run._id, {
      status: "failed",
      completedAt: Date.now(),
      metadata: mergeMetadata(run.metadata, args.metadata),
    });
  },
});

function mergeMetadata(existing: unknown, next: unknown) {
  if (existing && typeof existing === "object" && next && typeof next === "object") {
    return { ...(existing as Record<string, unknown>), ...(next as Record<string, unknown>) };
  }
  return next ?? existing ?? null;
}
