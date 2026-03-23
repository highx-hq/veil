import type {
  ChatRepository,
  CompleteChatRunInput,
  CreateChatRunInput,
  CreateChatThreadInput,
  FailChatRunInput,
  ListChatThreadsInput,
  VeilChatMessage,
  VeilChatThread,
  VeilChatRun,
} from "../types/index.js";

export class InMemoryChatRepository implements ChatRepository {
  private readonly threads = new Map<string, VeilChatThread>();
  private readonly messages = new Map<string, VeilChatMessage[]>();
  private readonly runs = new Map<string, VeilChatRun>();

  async createThread(input: CreateChatThreadInput): Promise<VeilChatThread> {
    const now = Date.now();
    const thread: VeilChatThread = {
      id: createChatId("thread"),
      userId: input.userId,
      status: "active",
      title: input.title,
      createdAt: now,
      updatedAt: now,
      metadata: input.metadata,
    };
    this.threads.set(thread.id, thread);
    this.messages.set(thread.id, []);
    return thread;
  }

  async getThread(threadId: string): Promise<VeilChatThread | null> {
    return this.threads.get(threadId) ?? null;
  }

  async listThreads(input?: ListChatThreadsInput): Promise<VeilChatThread[]> {
    const threads = [...this.threads.values()]
      .filter((thread) => !input?.userId || thread.userId === input.userId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return input?.limit ? threads.slice(0, input.limit) : threads;
  }

  async listMessages(threadId: string): Promise<VeilChatMessage[]> {
    return [...(this.messages.get(threadId) ?? [])].sort((a, b) => a.createdAt - b.createdAt);
  }

  async appendMessages(messages: VeilChatMessage[]): Promise<void> {
    for (const message of messages) {
      const list = this.messages.get(message.threadId) ?? [];
      list.push(message);
      this.messages.set(message.threadId, list);

      const thread = this.threads.get(message.threadId);
      if (thread) {
        this.threads.set(message.threadId, {
          ...thread,
          updatedAt: Math.max(thread.updatedAt, message.createdAt),
        });
      }
    }
  }

  async createRun(input: CreateChatRunInput): Promise<VeilChatRun> {
    const run: VeilChatRun = {
      id: createChatId("run"),
      threadId: input.threadId,
      status: "running",
      startedAt: Date.now(),
      snapshotKey: input.snapshotKey,
      snapshotVersion: input.snapshotVersion,
      toolPolicy: input.toolPolicy,
      metadata: input.metadata,
    };
    this.runs.set(run.id, run);
    return run;
  }

  async completeRun(input: CompleteChatRunInput): Promise<void> {
    const run = this.runs.get(input.runId);
    if (!run) return;
    this.runs.set(input.runId, {
      ...run,
      status: "completed",
      completedAt: Date.now(),
      metadata: { ...(run.metadata ?? {}), ...(input.metadata ?? {}) },
    });
  }

  async failRun(input: FailChatRunInput): Promise<void> {
    const run = this.runs.get(input.runId);
    if (!run) return;
    this.runs.set(input.runId, {
      ...run,
      status: "failed",
      completedAt: Date.now(),
      metadata: { ...(run.metadata ?? {}), ...(input.metadata ?? {}) },
    });
  }
}

export function createChatId(prefix: "thread" | "message" | "run"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
