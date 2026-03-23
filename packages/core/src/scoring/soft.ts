import { generateObject } from "ai";
import { z } from "zod";

import type { VeilCacheItem, VeilConfig, VeilFeedback, VeilRankedItem } from "../types/index.js";

const SoftRankingSchema = z.object({
  rankings: z.array(
    z.object({
      id: z.string(),
      llm_score: z.number().min(0).max(1),
      reasoning: z.string(),
    }),
  ),
});

export async function softRank(args: {
  snapshot: VeilCacheItem[];
  config: Pick<VeilConfig, "recommendation" | "llm">;
  feedback?: VeilFeedback[];
}): Promise<VeilRankedItem[]> {
  const { snapshot, config, feedback } = args;
  const candidates = snapshot.slice(0, config.recommendation.max ?? 200);

  const { object } = await generateObject({
    model: config.llm.recommendation,
    schema: SoftRankingSchema,
    system: SOFT_RANK_SYSTEM_PROMPT,
    prompt: buildSoftContext({ candidates, config, feedback: feedback ?? [] }),
  });

  return mergeRankings(candidates, object.rankings);
}

const SOFT_RANK_SYSTEM_PROMPT = `
You are a recommendation engine doing a second-pass ranking.
You will receive candidates (already hard-scored) and optional feedback.
Return per-item llm_score in [0,1] and short reasoning. Do not invent items.
`.trim();

function buildSoftContext(args: {
  candidates: VeilCacheItem[];
  config: Pick<VeilConfig, "recommendation" | "llm">;
  feedback: VeilFeedback[];
}): string {
  const lines = args.candidates.map(formatCandidateLine).join("\n");
  return [
    `SOFT_INSTRUCTIONS:\n${args.config.recommendation.soft}`,
    "",
    `FEEDBACK_JSON:\n${JSON.stringify(args.feedback)}`,
    "",
    `CANDIDATES:\n${lines}`,
  ].join("\n");
}

function formatCandidateLine(item: VeilCacheItem): string {
  const tags = item.tags?.join(",") ?? "";
  const meta = Object.entries(item.meta ?? {})
    .map(([k, v]) => `${k}:${v}`)
    .join(" ");
  return `${item.id} | ${item.name} | ${item.category} | score:${item.hard_score.toFixed(4)} | tags:${tags} ${meta}`.trim();
}

function mergeRankings(
  candidates: VeilCacheItem[],
  rankings: Array<{ id: string; llm_score: number; reasoning: string }>,
): VeilRankedItem[] {
  const byId = new Map(rankings.map((r) => [r.id, r]));

  const merged = candidates.map((c) => {
    const r = byId.get(c.id);
    return {
      id: c.id,
      name: c.name,
      category: c.category,
      tags: c.tags,
      meta: c.meta,
      hard_score: c.hard_score,
      llm_score: r?.llm_score ?? 0,
      reasoning: r?.reasoning ?? "",
      rank: 0,
    } satisfies VeilRankedItem;
  });

  merged.sort((a, b) => (b.llm_score - a.llm_score) || (b.hard_score - a.hard_score));
  for (let i = 0; i < merged.length; i++) merged[i]!.rank = i + 1;
  return merged;
}
