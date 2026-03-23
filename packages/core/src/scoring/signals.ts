import type { LLMRoleConfig } from "../types/config.js";
import type { VeilItem } from "../types/item.js";
import type { PluginSignal, PluginSignalSnapshot, VeilPlugin } from "../types/plugin.js";
import type { FeatureStats, StatsSnapshot } from "../types/scoring.js";
import type { StorageAdapter } from "../types/storage.js";

export async function collectPluginSignals(args: {
  items: VeilItem[];
  plugins?: VeilPlugin[];
  storage: StorageAdapter;
  llm: LLMRoleConfig;
  env?: Record<string, string>;
  user?: import("../types/user.js").UserContext;
  now?: number;
}): Promise<PluginSignal[]> {
  const signals = await Promise.all(
    (args.plugins ?? []).map(async (plugin) => {
      if (!plugin.collectSignals) return [];
      return plugin.collectSignals({
        items: args.items,
        storage: args.storage,
        llm: args.llm,
        env: args.env,
        user: args.user,
        now: args.now,
      });
    }),
  );

  return signals.flat();
}

export function buildPluginSignalSnapshot(signals: PluginSignal[]): PluginSignalSnapshot {
  const byItem: Record<string, Record<string, number>> = {};
  const statsInput = new Map<string, number[]>();
  const namespaces = new Set<string>();
  const latestByItemAndKey = new Map<string, { ts: number; value: number }>();

  for (const signal of signals) {
    namespaces.add(signal.namespace);
    for (const [featureKey, rawValue] of Object.entries(signal.features)) {
      const numeric = toNumericSignalValue(rawValue);
      if (numeric === undefined) continue;

      const scopedKey = `${signal.namespace}.${featureKey}`;
      const dedupeKey = `${signal.itemId}:${scopedKey}`;
      const prev = latestByItemAndKey.get(dedupeKey);
      if (prev && prev.ts > signal.ts) continue;
      latestByItemAndKey.set(dedupeKey, { ts: signal.ts, value: numeric });
    }
  }

  for (const [dedupeKey, payload] of latestByItemAndKey.entries()) {
    const splitAt = dedupeKey.indexOf(":");
    const itemId = dedupeKey.slice(0, splitAt);
    const featureKey = dedupeKey.slice(splitAt + 1);

    const itemSignals = byItem[itemId] ?? {};
    itemSignals[featureKey] = payload.value;
    byItem[itemId] = itemSignals;

    const values = statsInput.get(featureKey) ?? [];
    values.push(payload.value);
    statsInput.set(featureKey, values);
  }

  const stats: StatsSnapshot = {};
  for (const [featureKey, values] of statsInput.entries()) {
    stats[featureKey] = buildFeatureStats(values);
  }

  return {
    byItem,
    stats,
    signalCount: signals.length,
    namespaces: [...namespaces].sort(),
  };
}

function toNumericSignalValue(value: number | string | boolean): number | undefined {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  return undefined;
}

function buildFeatureStats(values: number[]): FeatureStats {
  if (!values.length) {
    return { min: 0, max: 0, mean: 0, stdDev: 0 };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;

  return {
    min,
    max,
    mean,
    stdDev: Math.sqrt(variance),
  };
}
