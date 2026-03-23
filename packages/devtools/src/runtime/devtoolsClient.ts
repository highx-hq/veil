export type DevtoolsClientOptions = {
  apiBaseUrl: string;
  pollIntervalMs: number;
  apiKey?: string;
};

export type DevtoolsAdapters = {
  storage: { kind: string } | null;
  queue: { kind: string } | null;
};

export type DevtoolsSettings = {
  models: {
    recommendation: string;
    chat: string;
    summary: string;
  };
  prompts: {
    recommendation: string;
    chat: string;
  };
  filters: {
    categories: string;
    priceMin: number;
    priceMax: number;
  };
  cache: {
    refreshCron: string;
    maxItems: number;
    kvBinding: string;
    queueBinding: string;
  };
  features: {
    recency: number;
    popularity: number;
    rating: number;
    price: number;
  };
  toggles: {
    cache: boolean;
    autocompletion: boolean;
    groupByCategory: boolean;
    backgroundRefresh: boolean;
    diversity: boolean;
    priceRange: boolean;
    webPlugin: boolean;
    reviewsPlugin: boolean;
    socialPlugin: boolean;
  };
};

export type DevtoolsUploadMeta = {
  id: string;
  filename: string;
  mime: string | null;
  sizeBytes: number;
  sha256: string;
  createdAt: number;
  storageKind: string;
  storageMode?: "native" | "kv";
  storageFileId?: string | null;
};

export type DevtoolsUploadContent = {
  id: string;
  filename: string;
  mime: string | null;
  bytesBase64: string;
};

export type DevtoolsRunState = {
  running: boolean;
  progress: number;
  message: string;
  selectedNodeId: string;
  nodeStates: Record<string, "idle" | "active" | "complete" | "error">;
  updatedAt: number;
};

export type DevtoolsStatus = {
  healthy?: boolean;
  cacheAge?: string;
  lastRan?: string;
  nextRun?: string;
  durationMs?: number;
  itemCount?: number;
  model?: string;
  plugins?: Array<{ id: string; archiveCount?: number; summaryUpdatedAt?: number }>;
  uploadCount?: number;
  runState?: DevtoolsRunState;
};

export type DevtoolsPluginMeta = {
  id: string;
  archiveCount?: number;
  summaryUpdatedAt?: number;
};

export type DevtoolsSnapshotItem = {
  id: string;
  name: string;
  category: string;
  rank: number;
  hard_score?: number;
  llm_score?: number;
  meta?: Record<string, unknown>;
};

export type DevtoolsKvTable = {
  key: string;
  value: unknown;
};

export type DevtoolsStreamEvent =
  | { type: "cycle:start"; ts: number }
  | { type: "cycle:end"; ts: number; ok: boolean }
  | { type: "node:active"; nodeId: string; ts: number }
  | { type: "node:complete"; nodeId: string; ts: number }
  | { type: "node:error"; nodeId: string; ts: number; error: string };

export type DevtoolsCycleResult = {
  ok: boolean;
  stage?: string;
  itemCount?: number;
  meta?: {
    ranAt?: number;
    durationMs?: number;
    itemCount?: number;
    model?: string;
    stage?: string;
  };
  snapshot?: DevtoolsSnapshotItem[];
};

export type DevtoolsChatMessage = {
  id?: string;
  role: "system" | "user" | "assistant" | "tool" | "ai";
  parts?: unknown;
  text?: string;
  visible?: boolean;
  createdAt?: number;
  threadId?: string;
};

export type DevtoolsChatThread = {
  id: string;
  userId?: string;
  status: "active" | "archived";
  title?: string;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
};

export type DevtoolsChatStreamEvent =
  | { type: "meta"; threadId: string; runId: string }
  | { type: "text-delta"; text: string }
  | {
      type: "tool-event";
      phase: "input-start" | "input-delta" | "call" | "result" | "error";
      id: string;
      toolName?: string;
      inputText?: string;
      input?: unknown;
      output?: unknown;
      error?: unknown;
    }
  | { type: "done"; threadId: string; runId: string }
  | { type: "error"; error: string };

export class DevtoolsClient {
  public readonly options: DevtoolsClientOptions;

  constructor(opts: DevtoolsClientOptions) {
    this.options = opts;
  }

  private url(path: string) {
    const base = this.options.apiBaseUrl?.replace(/\/+$/, "") ?? "";
    return `${base}${path}`;
  }

  async getStatus(): Promise<DevtoolsStatus> {
    return this.getJson("/api/devtools/status");
  }

  async getSnapshot(): Promise<DevtoolsSnapshotItem[]> {
    return this.getJson("/api/devtools/snapshot");
  }

  async getTables(): Promise<DevtoolsKvTable[]> {
    return this.getJson("/api/devtools/tables");
  }

  async getPlugins(): Promise<DevtoolsPluginMeta[]> {
    return this.getJson("/api/devtools/plugins");
  }

  async getAdapters(): Promise<DevtoolsAdapters> {
    return this.getJson("/api/devtools/adapters");
  }

  async getSettings(): Promise<DevtoolsSettings> {
    return this.getJson("/api/devtools/settings");
  }

  async saveSettings(settings: DevtoolsSettings): Promise<DevtoolsSettings> {
    return this.putJson("/api/devtools/settings", settings);
  }

  async runCycle(kind: "run" | "hard" | "soft", payload?: unknown): Promise<DevtoolsCycleResult> {
    return this.postJson(`/api/devtools/cycle/${kind}`, payload ?? {});
  }

  async simulate(payload: unknown): Promise<DevtoolsCycleResult> {
    return this.postJson("/api/devtools/simulate", payload);
  }

  async uploadFile(payload: { filename: string; mime: string | null; bytesBase64: string }): Promise<DevtoolsUploadMeta> {
    return this.postJson("/api/devtools/uploads", payload);
  }

  async getUploads(): Promise<DevtoolsUploadMeta[]> {
    return this.getJson("/api/devtools/uploads");
  }

  async getUploadContent(id: string): Promise<DevtoolsUploadContent> {
    const encoded = encodeURIComponent(id);
    return this.getJson(`/api/devtools/uploads/content?id=${encoded}`);
  }

  async updateUpload(
    id: string,
    payload: { filename: string; mime: string | null; bytesBase64: string },
  ): Promise<DevtoolsUploadMeta> {
    const encoded = encodeURIComponent(id);
    return this.putJson(`/api/devtools/uploads?id=${encoded}`, payload);
  }

  async deleteUpload(id: string): Promise<void> {
    const encoded = encodeURIComponent(id);
    const res = await fetch(this.url(`/api/devtools/uploads?id=${encoded}`), {
      method: "DELETE",
      headers: this.authHeaders(),
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  }

  stream(onEvent: (e: DevtoolsStreamEvent) => void, onError: (e: unknown) => void): () => void {
    const url = this.url("/api/devtools/stream");
    const es = new EventSource(url);
    es.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data) as DevtoolsStreamEvent;
        onEvent(data);
      } catch (err) {
        onError(err);
      }
    };
    es.onerror = (err) => onError(err);
    return () => es.close();
  }

  async createChatThread(payload: {
    userId?: string;
    title?: string;
    metadata?: Record<string, unknown>;
  }): Promise<DevtoolsChatThread> {
    return this.postJson("/api/devtools/chat/thread", payload);
  }

  async getChatMessages(threadId: string): Promise<DevtoolsChatMessage[]> {
    const encoded = encodeURIComponent(threadId);
    return this.getJson(`/api/devtools/chat/messages?threadId=${encoded}`);
  }

  async getChatThreads(userId?: string, limit = 50): Promise<DevtoolsChatThread[]> {
    const params = new URLSearchParams();
    if (userId) params.set("userId", userId);
    params.set("limit", String(limit));
    return this.getJson(`/api/devtools/chat/threads?${params.toString()}`);
  }

  async respondChatStream(
    payload: {
      threadId?: string;
      userId?: string;
      title?: string;
      message: string;
      metadata?: Record<string, unknown>;
    },
    handlers: {
      onThread: (threadId: string, runId: string | null) => void;
      onChunk: (chunk: string) => void;
      onEvent?: (event: DevtoolsChatStreamEvent) => void;
    },
  ): Promise<void> {
    const res = await fetch(this.url("/api/devtools/chat/respond"), {
      method: "POST",
      headers: { "content-type": "application/json", ...this.authHeaders() },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(body || `${res.status} ${res.statusText}`);
    }

    const reader = res.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      buffer += decoder.decode(value, { stream: true });
      ({ buffer } = this.consumeChatSseBuffer(buffer, handlers));
    }

    buffer += decoder.decode();
    this.consumeChatSseBuffer(buffer, handlers);
  }

  private consumeChatSseBuffer(
    buffer: string,
    handlers: {
      onThread: (threadId: string, runId: string | null) => void;
      onChunk: (chunk: string) => void;
      onEvent?: (event: DevtoolsChatStreamEvent) => void;
    },
  ): { buffer: string } {
    let rest = buffer;

    while (true) {
      const boundary = rest.indexOf("\n\n");
      if (boundary === -1) break;
      const rawEvent = rest.slice(0, boundary);
      rest = rest.slice(boundary + 2);
      const dataLine = rawEvent
        .split("\n")
        .find((line) => line.startsWith("data: "));
      if (!dataLine) continue;
      const payload = dataLine.slice(6);
      const event = JSON.parse(payload) as DevtoolsChatStreamEvent;
      if (event.type === "meta") {
        handlers.onThread(event.threadId, event.runId);
      }
      if (event.type === "text-delta") {
        handlers.onChunk(event.text);
      }
      handlers.onEvent?.(event);
    }

    return { buffer: rest };
  }

  private async getJson<T>(path: string): Promise<T> {
    const res = await fetch(this.url(path), {
      method: "GET",
      headers: this.authHeaders(),
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.url(path), {
      method: "POST",
      headers: { "content-type": "application/json", ...this.authHeaders() },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  private async putJson<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.url(path), {
      method: "PUT",
      headers: { "content-type": "application/json", ...this.authHeaders() },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  private authHeaders(): Record<string, string> {
    const k = this.options.apiKey;
    if (!k) return {};
    return { authorization: `Bearer ${k}` };
  }
}
