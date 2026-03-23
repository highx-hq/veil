import { makeFunctionReference } from "convex/server";

import type {
  ChatRepository,
  CreateChatRunInput,
  CreateChatThreadInput,
  FailChatRunInput,
  CompleteChatRunInput,
  ListChatThreadsInput,
  StorageAdapter,
  VeilChatMessage,
} from "@veil/core";

const storageGet = makeFunctionReference<"query">("_storage:get");
const storageSet = makeFunctionReference<"mutation">("_storage:set");
const storageDelete = makeFunctionReference<"mutation">("_storage:delete_");
const storageList = makeFunctionReference<"query">("_storage:list");

const createThreadRef = makeFunctionReference<"mutation">("chat_threads:create");
const getThreadRef = makeFunctionReference<"query">("chat_threads:get");
const listThreadsRef = makeFunctionReference<"query">("chat_threads:list");
const appendMessagesRef = makeFunctionReference<"mutation">("chat_messages:append");
const listMessagesRef = makeFunctionReference<"query">("chat_messages:listByThread");
const createRunRef = makeFunctionReference<"mutation">("chat_runs:create");
const completeRunRef = makeFunctionReference<"mutation">("chat_runs:complete");
const failRunRef = makeFunctionReference<"mutation">("chat_runs:fail");

export function createConvexChatRepository(ctx: {
  runMutation: any;
  runQuery: any;
}, refs?: {
  createThread?: any;
  getThread?: any;
  listThreads?: any;
  appendMessages?: any;
  listMessages?: any;
  createRun?: any;
  completeRun?: any;
  failRun?: any;
}): ChatRepository {
  const resolvedRefs = {
    createThread: refs?.createThread ?? (createThreadRef as any),
    getThread: refs?.getThread ?? (getThreadRef as any),
    listThreads: refs?.listThreads ?? (listThreadsRef as any),
    appendMessages: refs?.appendMessages ?? (appendMessagesRef as any),
    listMessages: refs?.listMessages ?? (listMessagesRef as any),
    createRun: refs?.createRun ?? (createRunRef as any),
    completeRun: refs?.completeRun ?? (completeRunRef as any),
    failRun: refs?.failRun ?? (failRunRef as any),
  };

  return {
    async createThread(input: CreateChatThreadInput) {
      const thread = (await ctx.runMutation(resolvedRefs.createThread, {
        userId: input.userId ?? null,
        title: input.title ?? null,
        metadata: input.metadata ?? null,
      })) as any;
      return fromThread(thread);
    },
    async getThread(threadId: string) {
      const thread = (await ctx.runQuery(resolvedRefs.getThread, { threadId })) as any;
      return thread ? fromThread(thread) : null;
    },
    async listThreads(input?: ListChatThreadsInput) {
      const threads = (await ctx.runQuery(resolvedRefs.listThreads, {
        userId: input?.userId ?? null,
        limit: input?.limit ?? null,
      })) as any[];
      return threads.map(fromThread).sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async listMessages(threadId: string) {
      const messages = (await ctx.runQuery(resolvedRefs.listMessages, { threadId })) as any[];
      return messages.map(fromMessage).sort((a, b) => a.createdAt - b.createdAt);
    },
    async appendMessages(messages: VeilChatMessage[]) {
      await ctx.runMutation(resolvedRefs.appendMessages, {
        messages: messages.map((message: VeilChatMessage) => ({
          ...message,
          runId: message.runId ?? null,
          toolName: message.toolName ?? null,
        })),
      });
    },
    async createRun(input: CreateChatRunInput) {
      const run = (await ctx.runMutation(resolvedRefs.createRun, {
        threadId: input.threadId,
        snapshotKey: input.snapshotKey,
        snapshotVersion: input.snapshotVersion ?? null,
        toolPolicy: input.toolPolicy,
        metadata: input.metadata ?? null,
      })) as any;
      return fromRun(run);
    },
    async completeRun(input: CompleteChatRunInput) {
      await ctx.runMutation(resolvedRefs.completeRun, {
        runId: input.runId,
        metadata: input.metadata ?? null,
      });
    },
    async failRun(input: FailChatRunInput) {
      await ctx.runMutation(resolvedRefs.failRun, {
        runId: input.runId,
        metadata: input.metadata ?? null,
      });
    },
  };
}

export function createConvexStorageAdapter(ctx: {
  runMutation: any;
  runQuery: any;
}, refs?: {
  get?: any;
  set?: any;
  delete?: any;
  list?: any;
}): StorageAdapter {
  const resolvedRefs = {
    get: refs?.get ?? (storageGet as any),
    set: refs?.set ?? (storageSet as any),
    delete: refs?.delete ?? (storageDelete as any),
    list: refs?.list ?? (storageList as any),
  };

  return {
    async get(key) {
      const result = (await ctx.runQuery(resolvedRefs.get, { key })) as { value: string | null };
      return result.value;
    },
    async set(key, value, ttlSeconds) {
      await ctx.runMutation(resolvedRefs.set, { key, value, ttlSeconds: ttlSeconds ?? null });
    },
    async delete(key) {
      await ctx.runMutation(resolvedRefs.delete, { key });
    },
    async list(prefix) {
      return (await ctx.runQuery(resolvedRefs.list, { prefix })) as string[];
    },
    info: {
      kind: "convex",
    },
  };
}

function fromThread(thread: any) {
  return {
    id: thread.id,
    userId: thread.userId ?? undefined,
    status: thread.status,
    title: thread.title ?? undefined,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    metadata: thread.metadata ?? undefined,
  };
}

function fromMessage(message: any): VeilChatMessage {
  return {
    id: message.id,
    threadId: message.threadId,
    role: message.role,
    parts: message.parts,
    visible: message.visible,
    createdAt: message.createdAt,
    runId: message.runId ?? undefined,
    toolName: message.toolName ?? undefined,
  };
}

function fromRun(run: any) {
  return {
    id: run.id,
    threadId: run.threadId,
    status: run.status,
    startedAt: run.startedAt,
    completedAt: run.completedAt ?? undefined,
    snapshotKey: run.snapshotKey,
    snapshotVersion: run.snapshotVersion ?? undefined,
    toolPolicy: run.toolPolicy,
    metadata: run.metadata ?? undefined,
  };
}
