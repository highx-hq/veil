import type { QueueAdapter, QueueMessage } from "@veil/core";

export type ConvexRunCtx = {
  runMutation: (ref: unknown, args: Record<string, any>) => Promise<any>;
};

export type ConvexQueueFns = {
  enqueue: unknown; // mutation({ message })
  batch: unknown; // mutation({ messages })
};

export function convexQueue(ctx: ConvexRunCtx, fns: ConvexQueueFns): QueueAdapter {
  return {
    enqueue: async (message: QueueMessage) => {
      await ctx.runMutation(fns.enqueue, { message });
    },
    batch: async (messages: QueueMessage[]) => {
      await ctx.runMutation(fns.batch, { messages });
    },
  };
}

