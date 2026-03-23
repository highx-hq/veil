import type { VeilItem } from "./item.js";
import type { PluginSignalSnapshot } from "./plugin.js";
import type { UserContext } from "./user.js";

export type LearnedRanker = (args: {
  items: VeilItem[];
  user?: UserContext;
  pluginSignals?: PluginSignalSnapshot;
  vectorScores?: Record<string, number>;
  now?: number;
}) => Promise<Record<string, number>>;

export type LearnedFeatureSource =
  | "field"
  | "plugin-signal"
  | "vector-score"
  | "category-affinity"
  | "tag-affinity"
  | "item-affinity";

export type LinearLearnedFeature = {
  key: string;
  source: LearnedFeatureSource;
  path?: string;
  weight: number;
  fallback?: number;
};

export type LinearLearnedRankerConfig = {
  bias?: number;
  features: LinearLearnedFeature[];
};

export type LearnedConfig = {
  ranker?: LearnedRanker;
};
