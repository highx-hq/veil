import type { StorageAdapter } from "@veil/core";

export type ConvexRunCtx = {
  runQuery: (ref: unknown, args: Record<string, any>) => Promise<any>;
  runMutation: (ref: unknown, args: Record<string, any>) => Promise<any>;
};

export type ConvexStorageFns = {
  get: unknown; // query({ key }): { value: string | null }
  set: unknown; // mutation({ key, value, ttlSeconds? })
  delete: unknown; // mutation({ key })
  list: unknown; // query({ prefix }): string[]
};

export function convexStorage(ctx: ConvexRunCtx, fns: ConvexStorageFns): StorageAdapter {
  return {
    get: async (key) => {
      const result = await ctx.runQuery(fns.get, { key });
      return (result?.value ?? null) as string | null;
    },
    set: async (key, value, ttlSeconds) => {
      await ctx.runMutation(fns.set, { key, value, ttlSeconds: ttlSeconds ?? null });
    },
    delete: async (key) => {
      await ctx.runMutation(fns.delete, { key });
    },
    list: async (prefix) => {
      const result = await ctx.runQuery(fns.list, { prefix });
      return (result ?? []) as string[];
    },
    info: { kind: "convex" },
  };
}
