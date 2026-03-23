import { createTextStreamResponse, stepCountIs, streamText } from "ai";

import { buildSystemPrompt, resolveChatConfigDefaults } from "./prompt.js";
import { createChatId } from "./persistence.js";
import { toTextReadableStream } from "./stream.js";
import { normalizeChatTools, resolveChatTools } from "./tools.js";
import type {
  ChatRespondInput,
  ChatRespondResult,
  VeilChatItem,
  VeilChatMessage,
  VeilChatRuntime,
  VeilChatRuntimeContext,
  VeilChatRuntimeOptions,
} from "../types/index.js";

export function createChatRuntime(options: VeilChatRuntimeOptions): VeilChatRuntime {
  const { config } = options;
  if (config.chat?.enabled) {
    if (!config.llm.chat && !options.model) {
      throw new Error("Veil chat requires llm.chat when chat.enabled is true.");
    }
    if (!config.chatRepository) {
      throw new Error("Veil chat requires chatRepository when chat.enabled is true.");
    }
  }

  const runtimeContext: VeilChatRuntimeContext = {
    storage: config.storage,
    llm: config.llm,
    env: config.env,
    config,
  };
  const registeredTools = resolveChatTools(config);

  return {
    createThread(input) {
      return getRepository(config).createThread(input);
    },
    getThread(threadId) {
      return getRepository(config).getThread(threadId);
    },
    listThreads(input) {
      return getRepository(config).listThreads(input);
    },
    listMessages(threadId) {
      return getRepository(config).listMessages(threadId);
    },
    async respond(input) {
      return respond({
        config,
        runtimeContext,
        registeredTools,
        model: options.model ?? config.llm.chat,
        input,
      });
    },
    toDataStreamResponse(result) {
      return createTextStreamResponse({
        textStream: result.stream,
        headers: {
          "content-type": "text/plain; charset=utf-8",
        },
      });
    },
  };
}

async function respond(args: {
  config: VeilChatRuntimeOptions["config"];
  runtimeContext: VeilChatRuntimeContext;
  registeredTools: ReturnType<typeof resolveChatTools>;
  model: VeilChatRuntimeOptions["model"];
  input: ChatRespondInput;
}): Promise<ChatRespondResult> {
  const { config, runtimeContext, registeredTools, model, input } = args;
  const repository = getRepository(config);
  const thread = await repository.getThread(input.threadId);
  if (!thread) {
    throw new Error(`Chat thread not found: ${input.threadId}`);
  }
  if (!model) {
    throw new Error("No chat model configured.");
  }

  const chatDefaults = resolveChatConfigDefaults(config.chat);
  const previousMessages = await repository.listMessages(thread.id);

  const run = await repository.createRun({
    threadId: thread.id,
    snapshotKey: chatDefaults.snapshotKey,
    snapshotVersion: undefined,
    toolPolicy: chatDefaults.toolPolicy,
    metadata: input.metadata,
  });

  let snapshot: VeilChatItem[];
  try {
    snapshot = await loadSnapshot(config.storage, chatDefaults.snapshotKey);
  } catch (error) {
    await repository.failRun({
      runId: run.id,
      metadata: {
        error: serializeError(error),
      },
    });
    throw error;
  }

  const userMessage: VeilChatMessage = {
    id: createChatId("message"),
    threadId: thread.id,
    role: "user",
    parts: input.message,
    visible: true,
    createdAt: Date.now(),
    runId: run.id,
  };

  await repository.appendMessages([userMessage]);

  const toolSet =
    chatDefaults.toolPolicy === "snapshot-only"
      ? undefined
      : normalizeChatTools({
          tools: registeredTools,
          thread,
          run,
          snapshot,
          runtimeContext,
        });
  const toolInputs = new Map<string, { toolName?: string; inputText: string }>();

  try {
    const result = streamText({
      model,
      system: buildSystemPrompt({
        chat: config.chat,
        snapshot,
        tools: registeredTools,
      }),
      messages: [...toModelMessages(previousMessages), { role: "user", content: input.message }] as any,
      tools: toolSet as any,
      stopWhen: toolSet ? stepCountIs(5) : stepCountIs(1),
      onChunk: async ({ chunk }: any) => {
        if (chunk?.type === "text-delta" && typeof chunk.text === "string") {
          await input.onTextDelta?.(chunk.text);
          return;
        }

        if (chunk?.type === "tool-input-start") {
          toolInputs.set(chunk.id, { toolName: chunk.toolName, inputText: "" });
          await input.onToolEvent?.({
            phase: "input-start",
            id: chunk.id,
            toolName: chunk.toolName,
          });
          return;
        }

        if (chunk?.type === "tool-input-delta") {
          const current = toolInputs.get(chunk.id) ?? { inputText: "" };
          const next = {
            toolName: current.toolName,
            inputText: `${current.inputText}${chunk.delta ?? ""}`,
          };
          toolInputs.set(chunk.id, next);
          await input.onToolEvent?.({
            phase: "input-delta",
            id: chunk.id,
            toolName: next.toolName,
            inputText: next.inputText,
          });
          return;
        }

        if (chunk?.type === "tool-call") {
          await input.onToolEvent?.({
            phase: "call",
            id: chunk.toolCallId ?? chunk.id ?? "",
            toolName: chunk.toolName,
            input: chunk.input ?? null,
            inputText: toolInputs.get(chunk.toolCallId ?? chunk.id ?? "")?.inputText,
          });
          return;
        }

        if (chunk?.type === "tool-result") {
          await input.onToolEvent?.({
            phase: "result",
            id: chunk.toolCallId ?? chunk.id ?? "",
            toolName: chunk.toolName,
            output: chunk.output ?? null,
          });
          return;
        }

        if (chunk?.type === "tool-error") {
          await input.onToolEvent?.({
            phase: "error",
            id: chunk.toolCallId ?? chunk.id ?? "",
            toolName: chunk.toolName,
            error: chunk.error,
          });
        }
      },
      onFinish: async (event: any) => {
        const messagesToPersist = buildFinalMessages({
          threadId: thread.id,
          runId: run.id,
          output: event,
          persistFullTrace: config.chat?.persistence?.fullTrace !== false,
        });

        if (messagesToPersist.length > 0) {
          await repository.appendMessages(messagesToPersist);
        }

        await repository.completeRun({
          runId: run.id,
          metadata: {
            finishReason: event?.finishReason ?? null,
            snapshotVersion: getSnapshotVersion(snapshot),
            usage: event?.usage ?? null,
            response: event?.response ?? null,
          },
        });
      },
      onError: async (error: any) => {
        await repository.failRun({
          runId: run.id,
          metadata: {
            error: serializeError(error),
          },
        });
      },
    } as any);

    return {
      stream: toTextReadableStream(result.textStream),
      runId: run.id,
      threadId: thread.id,
    };
  } catch (error) {
    await repository.failRun({
      runId: run.id,
      metadata: {
        error: serializeError(error),
      },
    });
    throw error;
  }
}

function getRepository(config: VeilChatRuntimeOptions["config"]) {
  if (!config.chatRepository) {
    throw new Error("No chat repository configured.");
  }
  return config.chatRepository;
}

async function loadSnapshot(storage: VeilChatRuntimeContext["storage"], snapshotKey: string): Promise<VeilChatItem[]> {
  const raw = await storage.get(snapshotKey);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("Snapshot payload must be an array.");
    }
    return parsed as VeilChatItem[];
  } catch (error) {
    throw new Error(`Failed to parse ${snapshotKey}: ${serializeError(error)}`);
  }
}

function getSnapshotVersion(snapshot: VeilChatItem[]): string | undefined {
  if (snapshot.length === 0) return undefined;
  return String(snapshot[0]?.rank ?? snapshot.length);
}

function toModelMessages(messages: VeilChatMessage[]): Array<{ role: VeilChatMessage["role"]; content: unknown }> {
  return messages
    .filter((message) => message.role !== "tool")
    .map((message) => ({
      role: message.role,
      content: message.parts,
    }));
}

function buildFinalMessages(input: {
  threadId: string;
  runId: string;
  output: any;
  persistFullTrace: boolean;
}): VeilChatMessage[] {
  const createdAt = Date.now();
  const messages: VeilChatMessage[] = [];
  const text = typeof input.output?.text === "string" ? input.output.text : "";

  if (!input.persistFullTrace) {
    return text
      ? [
          {
            id: createChatId("message"),
            threadId: input.threadId,
            role: "assistant",
            parts: text,
            visible: true,
            createdAt,
            runId: input.runId,
          },
        ]
      : messages;
  }

  const steps = Array.isArray(input.output?.steps) ? input.output.steps : [];
  for (const step of steps) {
    const toolCalls = Array.isArray(step?.toolCalls) ? step.toolCalls : [];
    const toolResults = Array.isArray(step?.toolResults) ? step.toolResults : [];

    for (const toolCall of toolCalls) {
      messages.push({
        id: createChatId("message"),
        threadId: input.threadId,
        role: "tool",
        parts: {
          type: "tool-call",
          toolCallId: toolCall.toolCallId ?? null,
          input: toolCall.input ?? null,
        },
        visible: false,
        createdAt,
        runId: input.runId,
        toolName: toolCall.toolName ?? undefined,
      });
    }

    for (const toolResult of toolResults) {
      messages.push({
        id: createChatId("message"),
        threadId: input.threadId,
        role: "tool",
        parts: {
          type: "tool-result",
          toolCallId: toolResult.toolCallId ?? null,
          output: toolResult.output ?? null,
        },
        visible: false,
        createdAt,
        runId: input.runId,
        toolName: toolResult.toolName ?? undefined,
      });
    }
  }

  if (text) {
    messages.push({
      id: createChatId("message"),
      threadId: input.threadId,
      role: "assistant",
      parts: text,
      visible: true,
      createdAt,
      runId: input.runId,
    });
  }

  return messages;
}

function serializeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}
