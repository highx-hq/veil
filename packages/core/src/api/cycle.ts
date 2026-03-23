import type {
  CycleRunOptions,
  StorageAdapter,
  VeilCacheItem,
  VeilChatItem,
  VeilConfig,
  VeilItem,
  VeilRankedItem,
  VeilResultMeta,
} from "../types/index.js";
import { hardScore } from "../scoring/hard.js";
import { scoreLearnedSignals } from "../scoring/learned.js";
import { retrieveCandidates } from "../scoring/retrieval.js";
import { buildPluginSignalSnapshot, collectPluginSignals } from "../scoring/signals.js";
import { softRank } from "../scoring/soft.js";

export function createCycleApi(config: VeilConfig, storage: StorageAdapter) {
  return {
    run: async (items: VeilItem[], options?: CycleRunOptions) => {
      const start = Date.now();
      const hardResult = await runHardInternal(items, config, storage, options);
      const hard = hardResult.snapshot;
      const ranked = await runSoftInternal(config, storage);

      const meta: VeilResultMeta = {
        ranAt: Date.now(),
        durationMs: Date.now() - start,
        itemCount: hard.length,
        pluginCount: config.plugins?.length ?? 0,
        signalCount: hardResult.signalSnapshot.signalCount,
        retrievedCount: hardResult.retrieval.retrievedCount,
      };
      await storage.set("snapshot:meta", JSON.stringify(meta));
      return ranked;
    },
    runHard: async (items: VeilItem[], options?: CycleRunOptions) =>
      (await runHardInternal(items, config, storage, options)).snapshot,
    runSoft: async () => runSoftInternal(config, storage),
    meta: async (): Promise<VeilResultMeta | null> => {
      const raw = await storage.get("snapshot:meta");
      return raw ? (JSON.parse(raw) as VeilResultMeta) : null;
    },
  };
}

async function runHardInternal(
  items: VeilItem[],
  config: VeilConfig,
  storage: StorageAdapter,
  options?: CycleRunOptions,
): Promise<{
  snapshot: VeilCacheItem[];
  signalSnapshot: ReturnType<typeof buildPluginSignalSnapshot>;
  retrieval: Awaited<ReturnType<typeof retrieveCandidates>>;
}> {
  const now = options?.now ?? Date.now();
  const retrieval = await retrieveCandidates({
    items,
    retrieval: config.retrieval,
    vector: config.vector,
    user: options?.user,
  });

  const signals = await collectPluginSignals({
    items: retrieval.items,
    plugins: config.plugins,
    storage,
    llm: config.llm,
    env: config.env,
    user: options?.user,
    now,
  });
  const signalSnapshot = buildPluginSignalSnapshot(signals);
  const learnedScores = await scoreLearnedSignals({
    items: retrieval.items,
    ranker: config.learned?.ranker,
    user: options?.user,
    pluginSignals: signalSnapshot,
    vectorScores: retrieval.vectorScores,
    now,
  });

  const snapshot = hardScore(retrieval.items, config.recommendation.hard, {
    stats: signalSnapshot.stats,
    context: {
      pluginSignals: signalSnapshot,
      now,
      user: options?.user,
      vectorScores: retrieval.vectorScores,
      learnedScores,
      retrieval,
    },
  });

  await storage.set("snapshot:hard", JSON.stringify(snapshot));
  await storage.set("snapshot:signals", JSON.stringify(signalSnapshot));
  await storage.set("snapshot:retrieval", JSON.stringify(retrieval));

  if (config.recommendation.groupByCategory) {
    const grouped = groupBy(snapshot, (i) => i.category);
    await Promise.all(
      [...grouped.entries()].map(([category, list]) =>
        storage.set(`snapshot:hard:category:${category}`, JSON.stringify(list)),
      ),
    );
  }

  return { snapshot, signalSnapshot, retrieval };
}

async function runSoftInternal(config: VeilConfig, storage: StorageAdapter): Promise<VeilRankedItem[]> {
  const raw = await storage.get("snapshot:hard");
  if (!raw) return [];
  const hard = JSON.parse(raw) as VeilCacheItem[];

  const ranked = await softRank({ snapshot: hard, config });
  await storage.set("snapshot:ranked", JSON.stringify(ranked));

  const chat: VeilChatItem[] = ranked.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    rank: item.rank,
    tags: item.tags,
    meta: item.meta,
  }));
  await storage.set("snapshot:chat", JSON.stringify(chat));

  return ranked;
}

function groupBy<T>(items: T[], keyFn: (item: T) => string) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}
