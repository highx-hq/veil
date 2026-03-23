import { v } from "convex/values";
import { makeFunctionReference, mutationGeneric } from "convex/server";

const processMessage = makeFunctionReference<"mutation">("queue:process");
const runCycle = makeFunctionReference<"action">("cycle:run");

export const enqueue = mutationGeneric({
  args: {
    message: v.any(),
    delayMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const delayMs = args.delayMs ?? 0;
    await ctx.scheduler.runAfter(delayMs, processMessage as any, { message: args.message });
  },
});

export const batch = mutationGeneric({
  args: {
    messages: v.array(v.any()),
    delayMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const delayMs = args.delayMs ?? 0;
    await Promise.all(
      args.messages.map((message) => ctx.scheduler.runAfter(delayMs, processMessage as any, { message })),
    );
  },
});

export const process = mutationGeneric({
  args: { message: v.any() },
  handler: async (ctx, args) => {
    const msg = args.message as { type?: string; payload?: unknown };
    if (msg?.type === "cycle.run") {
      await ctx.scheduler.runAfter(0, runCycle as any, (msg.payload ?? {}) as any);
      return;
    }

    throw new Error(`Unknown queue message type: ${String(msg?.type ?? "")}`);
  },
});
