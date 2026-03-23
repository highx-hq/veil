import { tool } from "ai";
import type { ToolSet } from "ai";

import type { VeilConfig, VeilChatRuntimeContext, VeilChatThread, VeilChatRun, VeilChatItem, VeilChatTool, VeilChatToolContext, VeilChatToolProvider } from "../types/index.js";

export function resolveChatTools(config: VeilConfig): VeilChatTool[] {
  const runtimeContext: VeilChatRuntimeContext = {
    storage: config.storage,
    llm: config.llm,
    env: config.env,
    config,
  };

  const tools = [
    ...(config.chatTools ?? []),
    ...resolveProviders(config.chatToolProviders ?? [], runtimeContext),
    ...resolveProviders(
      (config.plugins ?? []).flatMap((plugin) => {
        if (!plugin.chatTools) return [];
        return Array.isArray(plugin.chatTools) ? plugin.chatTools : [plugin.chatTools];
      }),
      runtimeContext,
    ),
  ];

  const seen = new Set<string>();
  for (const chatTool of tools) {
    if (seen.has(chatTool.name)) {
      throw new Error(`Duplicate chat tool name: ${chatTool.name}`);
    }
    seen.add(chatTool.name);
  }

  return tools;
}

function resolveProviders(providers: VeilChatToolProvider[], ctx: VeilChatRuntimeContext): VeilChatTool[] {
  return providers.flatMap((provider) => (typeof provider.tools === "function" ? provider.tools(ctx) : provider.tools));
}

export function normalizeChatTools(input: {
  tools: VeilChatTool[];
  thread: VeilChatThread;
  run: VeilChatRun;
  snapshot: VeilChatItem[];
  runtimeContext: VeilChatRuntimeContext;
}): ToolSet {
  const toolContext: VeilChatToolContext = {
    ...input.runtimeContext,
    thread: input.thread,
    run: input.run,
    snapshot: input.snapshot,
  };

  return Object.fromEntries(
    input.tools.map((chatTool) => [
      chatTool.name,
      tool({
        description: chatTool.description,
        inputSchema: chatTool.inputSchema,
        execute: async (value: unknown) => {
          try {
            return makeJsonSafe(await chatTool.execute(toolContext, value));
          } catch (error) {
            return {
              error: error instanceof Error ? error.message : String(error),
            };
          }
        },
      }),
    ]),
  );
}

function makeJsonSafe(value: unknown): unknown {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value));
}
