import { v } from "convex/values";
import { actionGeneric, makeFunctionReference } from "convex/server";

import { gemini } from "@veil/llm/gemini";
import { hardScore, softRank } from "@veil/core";

import type { VeilConfig } from "@veil/core";

const writeSnapshots = makeFunctionReference<"mutation">("_storage:writeSnapshots");
const recentFeedback = makeFunctionReference<"query">("feedback:recent");

export const run = actionGeneric({
  args: {
    items: v.array(v.any()),
    geminiApiKey: v.string(),
    config: v.object({
      recommendation: v.object({
        hard: v.any(),
        soft: v.string(),
        max: v.optional(v.number()),
        cache: v.optional(v.boolean()),
        autocompletion: v.optional(v.boolean()),
        groupByCategory: v.optional(v.boolean()),
        backgroundRefresh: v.optional(v.string()),
      }),
      models: v.optional(
        v.object({
          recommendation: v.optional(v.string()),
          chat: v.optional(v.string()),
          summary: v.optional(v.string()),
        }),
      ),
    }),
    userId: v.optional(v.string()),
    feedbackLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const start = Date.now();
    const hard = hardScore(args.items as any[], args.config.recommendation.hard as any);

    const veilConfig: Pick<VeilConfig, "recommendation" | "llm"> = {
      recommendation: {
        hard: args.config.recommendation.hard as any,
        soft: args.config.recommendation.soft,
        max: args.config.recommendation.max,
        cache: args.config.recommendation.cache,
        autocompletion: args.config.recommendation.autocompletion,
        groupByCategory: args.config.recommendation.groupByCategory,
        backgroundRefresh: args.config.recommendation.backgroundRefresh,
      },
      llm: {
        recommendation: gemini(args.config.models?.recommendation ?? "gemini-1.5-flash", {
          apiKey: args.geminiApiKey,
        }),
      },
    };

    const feedback = (await ctx.runQuery(recentFeedback as any, {
      userId: args.userId ?? null,
      limit: args.feedbackLimit ?? 200,
    })) as any[];

    const ranked = await softRank({
      snapshot: hard,
      config: veilConfig,
      feedback,
    });

    const chat = ranked.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      rank: item.rank,
      tags: item.tags,
      meta: item.meta,
    }));

    const meta = {
      ranAt: Date.now(),
      durationMs: Date.now() - start,
      itemCount: hard.length,
      model: args.config.models?.recommendation ?? "gemini-1.5-flash",
    };

    await ctx.runMutation(writeSnapshots as any, {
      hard: JSON.stringify(hard),
      ranked: JSON.stringify(ranked),
      chat: JSON.stringify(chat),
      meta: JSON.stringify(meta),
      groupByCategory: Boolean(args.config.recommendation.groupByCategory),
    });

    return { ok: true, itemCount: hard.length, meta };
  },
});
