import type { LinearLearnedRankerConfig, LearnedRanker } from "../types/learned.js";
import type { PluginSignalSnapshot } from "../types/plugin.js";
import type { UserContext } from "../types/user.js";
import type { VeilItem } from "../types/item.js";
import { getPath } from "../utils/getPath.js";

export async function scoreLearnedSignals(args: {
  items: VeilItem[];
  ranker?: LearnedRanker;
  user?: UserContext;
  pluginSignals?: PluginSignalSnapshot;
  vectorScores?: Record<string, number>;
  now?: number;
}): Promise<Record<string, number>> {
  if (!args.ranker) return {};
  return args.ranker({
    items: args.items,
    user: args.user,
    pluginSignals: args.pluginSignals,
    vectorScores: args.vectorScores,
    now: args.now,
  });
}

export function createLinearLearnedRanker(config: LinearLearnedRankerConfig): LearnedRanker {
  return async ({ items, user, pluginSignals, vectorScores }) => {
    const scores: Record<string, number> = {};

    for (const item of items) {
      let score = config.bias ?? 0;

      for (const feature of config.features) {
        const value = resolveFeatureValue({
          item,
          key: feature.key,
          source: feature.source,
          path: feature.path,
          user,
          pluginSignals,
          vectorScores,
        });
        score += (value ?? feature.fallback ?? 0) * feature.weight;
      }

      scores[item.id] = score;
    }

    return scores;
  };
}

function resolveFeatureValue(args: {
  item: VeilItem;
  key: string;
  source: LinearLearnedRankerConfig["features"][number]["source"];
  path?: string;
  user?: UserContext;
  pluginSignals?: PluginSignalSnapshot;
  vectorScores?: Record<string, number>;
}): number | undefined {
  switch (args.source) {
    case "field": {
      const raw = getPath(args.item, args.path ?? args.key);
      return typeof raw === "number" ? raw : undefined;
    }
    case "plugin-signal":
      return args.pluginSignals?.byItem[args.item.id]?.[args.key];
    case "vector-score":
      return args.vectorScores?.[args.item.id];
    case "category-affinity":
      return args.user?.categoryAffinity?.[args.item.category];
    case "tag-affinity": {
      const tags = args.item.tags ?? [];
      if (!tags.length || !args.user?.tagAffinity) return undefined;
      return tags.reduce((sum, tag) => sum + (args.user?.tagAffinity?.[tag] ?? 0), 0) / tags.length;
    }
    case "item-affinity":
      return args.user?.itemAffinity?.[args.item.id];
    default:
      return undefined;
  }
}
