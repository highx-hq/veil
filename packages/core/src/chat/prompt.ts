import type { ChatConfig } from "../types/config_chat.js";
import type { VeilChatItem, VeilChatTool } from "../types/index.js";

const DEFAULT_MAX_SNAPSHOT_ITEMS = 200;

export function resolveChatConfigDefaults(chat?: ChatConfig): Required<Pick<ChatConfig, "snapshotKey" | "maxSnapshotItems" | "toolPolicy">> {
  return {
    snapshotKey: chat?.snapshotKey ?? "snapshot:chat",
    maxSnapshotItems: chat?.maxSnapshotItems ?? DEFAULT_MAX_SNAPSHOT_ITEMS,
    toolPolicy: chat?.toolPolicy ?? "snapshot-first",
  };
}

export function buildSystemPrompt(input: {
  chat?: ChatConfig;
  snapshot: VeilChatItem[];
  tools: VeilChatTool[];
}): string {
  const { chat, snapshot, tools } = input;
  const defaults = resolveChatConfigDefaults(chat);
  const toolPolicy = defaults.toolPolicy;
  const snapshotSection =
    snapshot.length > 0
      ? snapshot
          .slice(0, defaults.maxSnapshotItems)
          .map((item) =>
            JSON.stringify({
              id: item.id,
              name: item.name,
              category: item.category,
              rank: item.rank,
              tags: item.tags ?? [],
              meta: item.meta ?? {},
            }),
          )
          .join("\n")
      : "SNAPSHOT_UNAVAILABLE";
  const platformContext =
    typeof chat?.platformContext === "string"
      ? chat.platformContext
      : chat?.platformContext
        ? JSON.stringify(chat.platformContext, null, 2)
        : "NONE";
  const toolRules = [
    "snapshot:chat is your primary source for product suggestions and comparisons.",
    "Prefer snapshot items before calling tools for recommendations.",
    "Call tools only when you need fresh details, precise lookup, or to take an action.",
    "Do not invent item details that are absent from the snapshot or tool output.",
    "Always call a tool before placing an order or taking any external action.",
    "Use platform context first for platform questions, then tools if it is insufficient.",
    toolPolicy === "snapshot-only" ? "Do not call tools. Answer only from platform context and snapshot data." : null,
    toolPolicy === "tool-heavy" ? "Use tools freely when they can improve specificity or freshness." : null,
    toolPolicy === "snapshot-first" ? "Stay snapshot-first. Only use tools when the snapshot is insufficient." : null,
  ]
    .filter(Boolean)
    .join("\n");
  const toolSection =
    tools.length > 0
      ? tools.map((tool) => `- ${tool.name}: ${tool.description}`).join("\n")
      : "NO_TOOLS_REGISTERED";

  return [
    chat?.systemPrompt?.trim() ?? "",
    "You are Veil Chat, an assistant embedded in a recommendation system.",
    "",
    "PLATFORM_CONTEXT",
    platformContext,
    "",
    "SNAPSHOT_ITEMS",
    snapshotSection,
    "",
    "TOOL_RULES",
    toolRules,
    "",
    "AVAILABLE_TOOLS",
    toolSection,
  ]
    .filter(Boolean)
    .join("\n");
}
