import type { HardConfig, VeilCacheItem, VeilItem } from "../types/index.js";
import type {
  FeatureProvider,
  FeatureStats,
  HardFeatureConfig,
  HardScoringOptions,
  ScoringPolicy,
  StatsSnapshot,
} from "../types/scoring.js";
import { getPath } from "../utils/getPath.js";

const DEFAULT_NORMALIZATION = "minmax";

const builtInProviders: Record<string, FeatureProvider> = {
  field: ({ item, feature }) => {
    if (!("field" in feature)) return undefined;
    const raw = getPath(item, feature.field);
    return typeof raw === "number" && !Number.isNaN(raw) ? raw : undefined;
  },
  freshness: ({ item, feature, context }) => {
    const field =
      ("field" in feature && feature.field) ||
      (typeof feature.params?.field === "string" ? feature.params.field : "createdAt");
    const halfLifeMs =
      typeof feature.params?.halfLifeMs === "number" ? feature.params.halfLifeMs : 1000 * 60 * 60 * 24 * 7;
    const now =
      typeof feature.params?.now === "number" ? feature.params.now : (context.now ?? Date.now());

    const raw = getPath(item, field);
    const ts =
      typeof raw === "number"
        ? raw
        : typeof raw === "string"
          ? Date.parse(raw)
          : Number.NaN;

    if (Number.isNaN(ts)) return undefined;
    if (halfLifeMs <= 0) return ts >= now ? 1 : 0;

    const age = Math.max(0, now - ts);
    return Math.exp((-Math.log(2) * age) / halfLifeMs);
  },
  "plugin-signal": ({ item, feature, context }) => {
    const key =
      typeof feature.params?.key === "string"
        ? feature.params.key
        : ("field" in feature && feature.field ? feature.field : undefined);
    if (!key) return undefined;
    return context.pluginSignals?.byItem[item.id]?.[key];
  },
  "semantic-similarity": ({ item, context }) => context.vectorScores?.[item.id],
  "user-affinity": ({ item, feature, context }) => {
    const affinityType =
      typeof feature.params?.type === "string" ? feature.params.type : "category";

    switch (affinityType) {
      case "item":
        return context.user?.itemAffinity?.[item.id];
      case "tag": {
        const tags = item.tags ?? [];
        if (!tags.length || !context.user?.tagAffinity) return undefined;
        return tags.reduce((sum, tag) => sum + (context.user?.tagAffinity?.[tag] ?? 0), 0) / tags.length;
      }
      case "category":
      default:
        return context.user?.categoryAffinity?.[item.category];
    }
  },
  "popularity-smoothed": ({ item, feature, context }) => {
    const viewsKey = typeof feature.params?.viewsKey === "string" ? feature.params.viewsKey : "behavior.views";
    const clicksKey = typeof feature.params?.clicksKey === "string" ? feature.params.clicksKey : "behavior.clicks";
    const purchasesKey =
      typeof feature.params?.purchasesKey === "string" ? feature.params.purchasesKey : "behavior.purchases";
    const prior = typeof feature.params?.prior === "number" ? feature.params.prior : 10;
    const purchaseWeight =
      typeof feature.params?.purchaseWeight === "number" ? feature.params.purchaseWeight : 3;

    const signals = context.pluginSignals?.byItem[item.id];
    const views = signals?.[viewsKey] ?? 0;
    const clicks = signals?.[clicksKey] ?? 0;
    const purchases = signals?.[purchasesKey] ?? 0;
    const positive = clicks + purchases * purchaseWeight;
    return Math.log1p(positive + prior) / Math.log1p(views + prior + 1);
  },
  "learned-score": ({ item, context }) => context.learnedScores?.[item.id],
};

export function createHardScorer(options: HardScoringOptions = {}) {
  const providers = {
    ...builtInProviders,
    ...(options.providers ?? {}),
  };
  const context = options.context ?? {};

  return {
    score(items: VeilItem[], config: HardConfig): VeilCacheItem[] {
      const filtered = applyHardFilters(items, config);
      const scored = scoreItems(filtered, config, providers, options.stats ?? {}, context);
      const adjusted = applyPolicies(scored, config.policies ?? []);
      return adjusted.sort((a, b) => b.hard_score - a.hard_score);
    },
  };
}

export function hardScore(
  items: VeilItem[],
  config: HardConfig,
  options: HardScoringOptions = {},
): VeilCacheItem[] {
  return createHardScorer(options).score(items, config);
}

function scoreItems(
  items: VeilItem[],
  config: HardConfig,
  providers: Record<string, FeatureProvider>,
  baseStats: StatsSnapshot,
  context: HardScoringOptions["context"],
): VeilCacheItem[] {
  const features = config.features ?? [];
  const resolvedStats = {
    ...baseStats,
    ...(context?.pluginSignals?.stats ?? {}),
    ...(config.stats ?? {}),
  };

  const featureSets = features.map((feature) => {
    const providerId = feature.provider ?? "field";
    const provider = providers[providerId];
    if (!provider) {
      throw new Error(`Unknown hard feature provider: ${providerId}`);
    }

    const rawValues = items.map((item) =>
      provider({ item, feature, stats: resolvedStats, context: context ?? {} }),
    );
    const stats = buildFeatureStats(rawValues, resolvedStats[feature.id]);

    return {
      feature,
      rawValues,
      stats,
    };
  });

  return items.map((item, index) => ({
    ...toCacheItem(item),
    hard_score: computeFeatureScore(index, featureSets),
  }));
}

function computeFeatureScore(
  index: number,
  featureSets: Array<{
    feature: HardFeatureConfig;
    rawValues: Array<number | undefined>;
    stats: FeatureStats;
  }>,
): number {
  let acc = 0;
  for (const featureSet of featureSets) {
    const normalized = normalizeFeatureValue(
      featureSet.rawValues[index],
      featureSet.feature,
      featureSet.stats,
      featureSet.rawValues,
    );
    acc += normalized * (featureSet.feature.weight ?? 0);
  }
  return acc;
}

function buildFeatureStats(values: Array<number | undefined>, existing?: FeatureStats): FeatureStats {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let count = 0;

  for (const value of values) {
    if (value === undefined || Number.isNaN(value)) continue;
    min = Math.min(min, value);
    max = Math.max(max, value);
    sum += value;
    count += 1;
  }

  if (count === 0) {
    return {
      min: existing?.min ?? 0,
      max: existing?.max ?? 0,
      mean: existing?.mean ?? 0,
      stdDev: existing?.stdDev ?? 0,
    };
  }

  const mean = existing?.mean ?? (sum / count);
  let varianceSum = 0;
  for (const value of values) {
    if (value === undefined || Number.isNaN(value)) continue;
    varianceSum += (value - mean) ** 2;
  }

  return {
    min: existing?.min ?? min,
    max: existing?.max ?? max,
    mean,
    stdDev: existing?.stdDev ?? Math.sqrt(varianceSum / count),
  };
}

function normalizeFeatureValue(
  value: number | undefined,
  feature: HardFeatureConfig,
  stats: FeatureStats,
  rawValues: Array<number | undefined>,
): number {
  if (value === undefined || Number.isNaN(value)) {
    return feature.missingValue ?? 0;
  }

  const direction = feature.direction ?? "asc";
  const mode = feature.normalize ?? DEFAULT_NORMALIZATION;
  let normalized: number;

  switch (mode) {
    case "none":
      normalized = value;
      break;
    case "rank":
      normalized = rankNormalize(value, rawValues);
      break;
    case "zscore":
      normalized = zScoreNormalize(value, stats);
      break;
    case "sigmoid":
      normalized = sigmoidNormalize(value, stats);
      break;
    case "minmax":
    default:
      normalized = minMaxNormalize(value, stats);
      break;
  }

  if (direction === "desc") {
    return mode === "none" ? normalized * -1 : 1 - normalized;
  }

  return normalized;
}

function minMaxNormalize(value: number, stats: FeatureStats): number {
  const min = stats.min ?? 0;
  const max = stats.max ?? 0;
  if (max === min) return 0;
  return clamp((value - min) / (max - min));
}

function zScoreNormalize(value: number, stats: FeatureStats): number {
  const mean = stats.mean ?? 0;
  const stdDev = stats.stdDev ?? 0;
  if (stdDev === 0) return 0.5;
  const z = (value - mean) / stdDev;
  return clamp((z + 3) / 6);
}

function sigmoidNormalize(value: number, stats: FeatureStats): number {
  const mean = stats.mean ?? 0;
  const stdDev = stats.stdDev ?? 0;
  const scaled = stdDev > 0 ? (value - mean) / stdDev : value;
  return 1 / (1 + Math.exp(-scaled));
}

function rankNormalize(value: number, values: Array<number | undefined>): number {
  const present = values.filter((entry): entry is number => entry !== undefined && !Number.isNaN(entry));
  if (present.length <= 1) return 0;

  let lowerOrEqual = 0;
  for (const entry of present) {
    if (entry <= value) lowerOrEqual += 1;
  }

  return (lowerOrEqual - 1) / (present.length - 1);
}

function clamp(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function toCacheItem(item: VeilItem): Omit<VeilCacheItem, "hard_score"> {
  const { id, name, category, tags, ...rest } = item;
  return { id, name, category, tags, meta: extractSlimMeta(rest) };
}

function extractSlimMeta(rest: Record<string, unknown>): Record<string, string | number | boolean> | undefined {
  const meta: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      meta[key] = value;
    }
  }
  return Object.keys(meta).length ? meta : undefined;
}

function applyHardFilters(items: VeilItem[], config: HardConfig): VeilItem[] {
  const filters = config.filters ?? [];
  const categories = config.categories?.filter(Boolean) ?? [];

  if (!filters.length && !categories.length) return items;

  return items.filter((item) => {
    if (categories.length && !categories.includes(item.category)) {
      return false;
    }

    for (const filter of filters) {
      const actual = getPath(item, filter.field);
      switch (filter.op) {
        case "eq":
          if (actual !== filter.value) return false;
          break;
        case "neq":
          if (actual === filter.value) return false;
          break;
        case "gt":
          if (typeof actual !== "number" || actual <= filter.value) return false;
          break;
        case "gte":
          if (typeof actual !== "number" || actual < filter.value) return false;
          break;
        case "lt":
          if (typeof actual !== "number" || actual >= filter.value) return false;
          break;
        case "lte":
          if (typeof actual !== "number" || actual > filter.value) return false;
          break;
        case "in":
          if (!filter.value.includes(actual)) return false;
          break;
        case "nin":
          if (filter.value.includes(actual)) return false;
          break;
        default: {
          const _exhaustive: never = filter;
          return _exhaustive;
        }
      }
    }
    return true;
  });
}

function applyPolicies(items: VeilCacheItem[], policies: ScoringPolicy[]): VeilCacheItem[] {
  let next = items;
  for (const policy of policies) {
    switch (policy.id) {
      case "diversity": {
        const counts = new Map<string, number>();
        next = next.filter((item) => {
          const count = counts.get(item.category) ?? 0;
          if (count >= policy.maxPerCategory) return false;
          counts.set(item.category, count + 1);
          return true;
        });
        break;
      }
      case "price-range": {
        next = next.filter((item) => {
          const val = getPath(item, policy.field);
          if (typeof val !== "number") return false;
          return val >= policy.min && val <= policy.max;
        });
        break;
      }
      case "boost": {
        next = next.map((item) => {
          const val = getPath(item, policy.field);
          if (val !== policy.value) return item;
          return { ...item, hard_score: item.hard_score * policy.multiplier };
        });
        break;
      }
      case "penalty": {
        next = next.map((item) => {
          const val = getPath(item, policy.field);
          if (val !== policy.value) return item;
          return { ...item, hard_score: item.hard_score * policy.multiplier };
        });
        break;
      }
      case "custom": {
        next = next.map((item) => ({ ...item, hard_score: item.hard_score + policy.fn(item) }));
        break;
      }
      default: {
        const _exhaustive: never = policy;
        return _exhaustive;
      }
    }
  }
  return next;
}
