import { v } from "convex/values";
import { actionGeneric, makeFunctionReference, queryGeneric } from "convex/server";

import { createChatRuntime, readTextStream } from "@veil/core";
import { gemini } from "@veil/llm/gemini";

import { createConvexChatRepository, createConvexStorageAdapter } from "./chat_repository.js";
import { buildConvexTools } from "./chat_tools_runtime.js";

const listMessagesRef = makeFunctionReference<"query">("chat_messages:listByThread");
const listThreadsRef = makeFunctionReference<"query">("chat_threads:list");

export const createThread = actionGeneric({
  args: {
    userId: v.optional(v.string()),
    title: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const runtime = createChatRuntime({
      config: {
        recommendation: { hard: {} as any, soft: "" },
        llm: {},
        storage: createConvexStorageAdapter(ctx),
        chatRepository: createConvexChatRepository(ctx),
        chat: { enabled: false },
      } as any,
    });

    return await runtime.createThread({
      userId: args.userId,
      title: args.title,
      metadata: args.metadata as Record<string, unknown> | undefined,
    });
  },
});

export const listMessages = queryGeneric({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const messages = (await ctx.runQuery(listMessagesRef as any, { threadId: args.threadId })) as any[];
    return messages.map((message) => ({
      id: message.id,
      threadId: message.threadId,
      role: message.role,
      parts: message.parts,
      visible: message.visible,
      createdAt: message.createdAt,
      runId: message.runId ?? undefined,
      toolName: message.toolName ?? undefined,
    }));
  },
});

export const listThreads = queryGeneric({
  args: {
    userId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const threads = (await ctx.runQuery(listThreadsRef as any, {
      userId: args.userId ?? null,
      limit: args.limit ?? null,
    })) as any[];
    return threads.map((thread) => ({
      id: thread.id,
      userId: thread.userId ?? undefined,
      status: thread.status,
      title: thread.title ?? undefined,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      metadata: thread.metadata ?? undefined,
    }));
  },
});

export const respond = actionGeneric({
  args: {
    threadId: v.string(),
    message: v.string(),
    userId: v.optional(v.string()),
    metadata: v.optional(v.any()),
    geminiApiKey: v.string(),
    model: v.optional(v.string()),
    systemPrompt: v.optional(v.string()),
    platformContext: v.optional(v.any()),
    snapshotKey: v.optional(v.string()),
    maxSnapshotItems: v.optional(v.number()),
    toolPolicy: v.optional(v.union(v.literal("snapshot-first"), v.literal("tool-heavy"), v.literal("snapshot-only"))),
    tools: v.optional(
      v.array(
        v.object({
          name: v.string(),
          description: v.string(),
          inputSchema: v.any(),
          kind: v.union(v.literal("query"), v.literal("mutation"), v.literal("action")),
          handler: v.string(),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const chatTools = buildConvexTools(ctx, args.tools ?? []);
    const runtime = createChatRuntime({
      config: {
        recommendation: { hard: {} as any, soft: "" },
        llm: {
          chat: gemini(args.model ?? "gemini-1.5-flash", { apiKey: args.geminiApiKey }),
        },
        storage: createConvexStorageAdapter(ctx),
        chatRepository: createConvexChatRepository(ctx),
        chatTools,
        chat: {
          enabled: true,
          systemPrompt: args.systemPrompt,
          platformContext: args.platformContext as Record<string, unknown> | string | undefined,
          snapshotKey: args.snapshotKey,
          maxSnapshotItems: args.maxSnapshotItems,
          toolPolicy: args.toolPolicy,
        },
      } as any,
    });

    const result = await runtime.respond({
      threadId: args.threadId,
      message: args.message,
      userId: args.userId,
      metadata: args.metadata as Record<string, unknown> | undefined,
    });

    return {
      runId: result.runId,
      threadId: result.threadId,
      text: await readTextStream(result.stream),
    };
  },
});
