import type { PluginSignal, VeilPlugin } from "../types/plugin.js";
import { getPath } from "../utils/getPath.js";

type FieldMap = Record<string, string>;

export function createReviewsSignalPlugin(options: {
  namespace?: string;
  fields?: FieldMap;
} = {}): VeilPlugin {
  const namespace = options.namespace ?? "reviews";
  const fields = {
    avg_rating: "rating",
    review_count: "reviewCount",
    rating_velocity: "ratingVelocity",
    ...(options.fields ?? {}),
  };
  return createFieldSignalPlugin(namespace, fields);
}

export function createSocialSignalPlugin(options: {
  namespace?: string;
  fields?: FieldMap;
} = {}): VeilPlugin {
  const namespace = options.namespace ?? "social";
  const fields = {
    mention_count: "mentionCount",
    sentiment_score: "sentimentScore",
    trend_score: "trendScore",
    ...(options.fields ?? {}),
  };
  return createFieldSignalPlugin(namespace, fields);
}

export function createBehaviorSignalPlugin(options: {
  namespace?: string;
  fields?: FieldMap;
} = {}): VeilPlugin {
  const namespace = options.namespace ?? "behavior";
  const fields = {
    views: "views",
    clicks: "clicks",
    purchases: "purchases",
    dwell_ms: "dwellMs",
    ...(options.fields ?? {}),
  };

  return {
    id: namespace,
    version: "1.0.0",
    async collectSignals({ items }) {
      const now = Date.now();
      const signals: PluginSignal[] = [];
      for (const item of items) {
        const views = readNumber(item, fields.views);
        const clicks = readNumber(item, fields.clicks);
        const purchases = readNumber(item, fields.purchases);
        const dwellMs = readNumber(item, fields.dwell_ms);

        signals.push({
          itemId: item.id,
          namespace,
          ts: now,
          features: {
            views,
            clicks,
            purchases,
            dwell_ms: dwellMs,
            ctr: views > 0 ? clicks / views : 0,
            cvr: clicks > 0 ? purchases / clicks : 0,
          },
        });
      }
      return signals;
    },
  };
}

export function createFieldSignalPlugin(namespace: string, fields: FieldMap): VeilPlugin {
  return {
    id: namespace,
    version: "1.0.0",
    async collectSignals({ items }) {
      const now = Date.now();
      return items.map((item) => ({
        itemId: item.id,
        namespace,
        ts: now,
        features: Object.fromEntries(
          Object.entries(fields).map(([featureKey, path]) => [featureKey, readSignalValue(item, path)]),
        ),
      }));
    },
  };
}

function readSignalValue(item: Record<string, unknown>, path: string): number | string | boolean {
  const value = getPath(item, path);
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  return 0;
}

function readNumber(item: Record<string, unknown>, path: string): number {
  const value = getPath(item, path);
  return typeof value === "number" && !Number.isNaN(value) ? value : 0;
}
