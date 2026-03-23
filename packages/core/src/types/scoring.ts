import type { LearnedRanker } from "./learned.js";
import type { VeilCacheItem, VeilItem } from "./item.js";
import type { PluginSignalSnapshot } from "./plugin.js";
import type { CandidateRetrievalResult } from "./retrieval.js";
import type { UserContext } from "./user.js";

export type FeatureNormalization = "minmax" | "zscore" | "rank" | "sigmoid" | "none";

export type HardFeatureConfig =
  | {
      id: string;
      provider?: "field";
      field: string;
      weight: number;
      normalize?: FeatureNormalization;
      direction?: "asc" | "desc";
      missingValue?: number;
      params?: Record<string, unknown>;
    }
  | {
      id: string;
      provider: string;
      weight: number;
      normalize?: FeatureNormalization;
      direction?: "asc" | "desc";
      missingValue?: number;
      params?: Record<string, unknown>;
    };

export type FeatureStats = {
  min?: number;
  max?: number;
  mean?: number;
  stdDev?: number;
};

export type StatsSnapshot = Record<string, FeatureStats>;

export type FeatureProvider = (args: {
  item: VeilItem;
  feature: HardFeatureConfig;
  stats: StatsSnapshot;
  context: HardScoringContext;
}) => number | undefined;

export type HardScoringContext = {
  pluginSignals?: PluginSignalSnapshot;
  now?: number;
  user?: UserContext;
  vectorScores?: Record<string, number>;
  learnedScores?: Record<string, number>;
  retrieval?: CandidateRetrievalResult;
};

export type HardScoringOptions = {
  providers?: Record<string, FeatureProvider>;
  stats?: StatsSnapshot;
  context?: HardScoringContext;
  learnedRanker?: LearnedRanker;
};

export type ScoringPolicy =
  | { id: "diversity"; maxPerCategory: number }
  | { id: "price-range"; field: string; min: number; max: number }
  | { id: "boost"; field: string; value: unknown; multiplier: number }
  | { id: "penalty"; field: string; value: unknown; multiplier: number }
  | { id: "custom"; fn: (item: VeilItem | VeilCacheItem) => number };
