import type { ServeFilter, ServeOptions, StorageAdapter, VeilRankedItem } from "../types/index.js";
import { getPath } from "../utils/getPath.js";

export function createRecommendApi(storage: StorageAdapter) {
  return {
    get: async (options?: ServeOptions): Promise<VeilRankedItem[]> => getRecommendations(storage, options),
    filter: (items: VeilRankedItem[], options?: ServeOptions): VeilRankedItem[] => {
      let next = items;
      if (options?.filter) next = applyServeFilter(next, options.filter);
      const offset = options?.offset ?? 0;
      const limit = options?.limit ?? next.length;
      return next.slice(offset, offset + limit);
    },
  };
}

async function getRecommendations(storage: StorageAdapter, options?: ServeOptions): Promise<VeilRankedItem[]> {
  const raw = await storage.get("snapshot:ranked");
  if (!raw) return [];

  let items = JSON.parse(raw) as VeilRankedItem[];
  if (options?.filter) items = applyServeFilter(items, options.filter);

  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? items.length;
  return items.slice(offset, offset + limit);
}

function applyServeFilter(items: VeilRankedItem[], filter: ServeFilter): VeilRankedItem[] {
  return items.filter((item) => {
    if (filter.match) {
      for (const [path, value] of Object.entries(filter.match)) {
        if (getPath(item, path) !== value) return false;
      }
    }

    if (filter.range) {
      for (const [path, bounds] of Object.entries(filter.range)) {
        const val = getPath(item, path);
        if (typeof val !== "number") return false;
        if (bounds.min !== undefined && val < bounds.min) return false;
        if (bounds.max !== undefined && val > bounds.max) return false;
      }
    }

    if (filter.categories) {
      const { include, exclude } = filter.categories;
      if (include?.length && !include.includes(item.category)) return false;
      if (exclude?.length && exclude.includes(item.category)) return false;
    }

    if (filter.tags) {
      const { include, exclude } = filter.tags;
      const itemTags = item.tags ?? [];
      if (include?.length && !include.some((t) => itemTags.includes(t))) return false;
      if (exclude?.length && exclude.some((t) => itemTags.includes(t))) return false;
    }

    if (filter.blocklist?.includes(item.id)) return false;
    if (filter.custom && !filter.custom(item)) return false;
    return true;
  });
}

