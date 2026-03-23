import { generateText } from "ai";
import { v } from "convex/values";
import { actionGeneric, makeFunctionReference } from "convex/server";

import { gemini } from "@veil/llm/gemini";

const getSnapshotChat = makeFunctionReference<"query">("_storage:get");

export const respond = actionGeneric({
  args: {
    messages: v.array(v.any()),
    geminiApiKey: v.string(),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.runQuery(getSnapshotChat as any, { key: "snapshot:chat" });

    const items = doc?.value ? (JSON.parse(doc.value) as any[]) : [];

    const { text } = await generateText({
      model: gemini(args.model ?? "gemini-1.5-flash", { apiKey: args.geminiApiKey }),
      system: buildChatSystemPrompt(items),
      messages: args.messages as any,
    });

    return { text };
  },
});

function buildChatSystemPrompt(items: Array<{ id: string; name: string; category: string; rank: number }>): string {
  const lines = items
    .slice(0, 200)
    .map((i) => `${i.rank}. ${i.name} (${i.category}) [${i.id}]`)
    .join("\n");
  return [
    "You are Veil Chat, an assistant embedded in a recommendation system.",
    "You have access to the current ranked recommendations snapshot.",
    "Use it to answer questions and suggest items when relevant.",
    "",
    "RANKED_ITEMS:",
    lines,
  ].join("\n");
}
