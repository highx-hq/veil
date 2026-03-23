import type { LanguageModel, Schema } from "ai";
import type { z } from "zod";

import type { VeilConfig, LLMRoleConfig } from "./config.js";
import type { VeilChatItem } from "./item.js";
import type { StorageAdapter } from "./storage.js";

export type VeilChatToolPolicy = "snapshot-first" | "tool-heavy" | "snapshot-only";

export type VeilChatThreadStatus = "active" | "archived";
export type VeilChatRunStatus = "running" | "completed" | "failed";
export type VeilChatMessageRole = "system" | "user" | "assistant" | "tool";

export type VeilChatThread = {
  id: string;
  userId?: string;
  status: VeilChatThreadStatus;
  title?: string;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
};

export type VeilChatMessage = {
  id: string;
  threadId: string;
  role: VeilChatMessageRole;
  parts: unknown;
  visible: boolean;
  createdAt: number;
  runId?: string;
  toolName?: string;
};

export type VeilChatRun = {
  id: string;
  threadId: string;
  status: VeilChatRunStatus;
  startedAt: number;
  completedAt?: number;
  snapshotKey: string;
  snapshotVersion?: string;
  toolPolicy: VeilChatToolPolicy;
  metadata?: Record<string, unknown>;
};

export type VeilChatRuntimeContext = {
  storage: StorageAdapter;
  llm: LLMRoleConfig;
  env?: Record<string, string>;
  config: VeilConfig;
};

export type VeilChatToolContext = VeilChatRuntimeContext & {
  thread: VeilChatThread;
  run: VeilChatRun;
  snapshot: VeilChatItem[];
};

export type VeilChatTool = {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny | Schema<unknown>;
  execute: (ctx: VeilChatToolContext, input: unknown) => Promise<unknown>;
};

export type VeilChatToolProvider = {
  id: string;
  version: string;
  tools: VeilChatTool[] | ((ctx: VeilChatRuntimeContext) => VeilChatTool[]);
};

export type CreateChatThreadInput = {
  userId?: string;
  title?: string;
  metadata?: Record<string, unknown>;
};

export type ListChatThreadsInput = {
  userId?: string;
  limit?: number;
};

export type CreateChatRunInput = {
  threadId: string;
  snapshotKey: string;
  snapshotVersion?: string;
  toolPolicy: VeilChatToolPolicy;
  metadata?: Record<string, unknown>;
};

export type CompleteChatRunInput = {
  runId: string;
  metadata?: Record<string, unknown>;
};

export type FailChatRunInput = {
  runId: string;
  metadata?: Record<string, unknown>;
};

export type ChatRepository = {
  createThread(input: CreateChatThreadInput): Promise<VeilChatThread>;
  getThread(threadId: string): Promise<VeilChatThread | null>;
  listThreads(input?: ListChatThreadsInput): Promise<VeilChatThread[]>;
  listMessages(threadId: string): Promise<VeilChatMessage[]>;
  appendMessages(messages: VeilChatMessage[]): Promise<void>;
  createRun(input: CreateChatRunInput): Promise<VeilChatRun>;
  completeRun(input: CompleteChatRunInput): Promise<void>;
  failRun(input: FailChatRunInput): Promise<void>;
};

export type ChatRespondInput = {
  threadId: string;
  message: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  onTextDelta?: (text: string) => Promise<void> | void;
  onToolEvent?: (event: {
    phase: "input-start" | "input-delta" | "call" | "result" | "error";
    id: string;
    toolName?: string;
    inputText?: string;
    input?: unknown;
    output?: unknown;
    error?: unknown;
  }) => Promise<void> | void;
};

export type ChatRespondResult = {
  stream: ReadableStream;
  runId: string;
  threadId: string;
};

export type VeilChatRuntime = {
  createThread(input: CreateChatThreadInput): Promise<VeilChatThread>;
  getThread(threadId: string): Promise<VeilChatThread | null>;
  listThreads(input?: ListChatThreadsInput): Promise<VeilChatThread[]>;
  listMessages(threadId: string): Promise<VeilChatMessage[]>;
  respond(input: ChatRespondInput): Promise<ChatRespondResult>;
  toDataStreamResponse?(result: ChatRespondResult): Response;
};

export type VeilChatRuntimeOptions = {
  config: VeilConfig;
  model?: LanguageModel;
};
