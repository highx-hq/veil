import { v } from "convex/values";
import { queryGeneric } from "convex/server";

function getPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const parts = path.split(".").filter(Boolean);
  let current: any = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

export const get = queryGeneric({
  args: {
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
    filter: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.query("kv").withIndex("by_key", (q) => q.eq("key", "snapshot:ranked")).first();
    if (!doc) return [];

    let items = JSON.parse(doc.value) as any[];
    if (args.filter) items = applyServeFilter(items, args.filter as any);

    const offset = args.offset ?? 0;
    const limit = args.limit ?? items.length;
    return items.slice(offset, offset + limit);
  },
});

function applyServeFilter(items: any[], filter: any): any[] {
  return items.filter((item) => {
    if (filter.match) {
      for (const [path, value] of Object.entries(filter.match as Record<string, unknown>)) {
        if (getPath(item, path) !== value) return false;
      }
    }

    if (filter.range) {
      for (const [path, bounds] of Object.entries(filter.range as Record<string, { min?: number; max?: number }>)) {
        const val = getPath(item, path);
        if (typeof val !== "number") return false;
        if (bounds.min !== undefined && val < bounds.min) return false;
        if (bounds.max !== undefined && val > bounds.max) return false;
      }
    }

    if (filter.categories) {
      const { include, exclude } = filter.categories as { include?: string[]; exclude?: string[] };
      if (include?.length && !include.includes(item.category)) return false;
      if (exclude?.length && exclude.includes(item.category)) return false;
    }

    if (filter.tags) {
      const { include, exclude } = filter.tags as { include?: string[]; exclude?: string[] };
      const itemTags = item.tags ?? [];
      if (include?.length && !include.some((t) => itemTags.includes(t))) return false;
      if (exclude?.length && exclude.some((t) => itemTags.includes(t))) return false;
    }

    if (filter.blocklist?.includes(item.id)) return false;
    if (filter.custom) return false;
    return true;
  });
}
