import { httpRouter } from "convex/server";
import { httpActionGeneric } from "convex/server";
import { createChatRuntime, hardScore, readTextStream, softRank } from "@veil/core";
import { gemini } from "@veil/llm/gemini";

import { createConvexChatRepository, createConvexStorageAdapter } from "../chat_repository.js";
import { buildConvexTools, type ConvexToolDescriptor } from "../chat_tools_runtime.js";

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

type DevtoolsRunState = {
  running: boolean;
  progress: number;
  message: string;
  selectedNodeId: string;
  nodeStates: Record<string, "idle" | "active" | "complete" | "error">;
  updatedAt: number;
};

export type CreateDevtoolsHttpRouterOptions = {
  component: unknown;
  settingsKey?: string;
  uploadsPrefix?: string;
  corsOrigin?: string;
  enabled?: boolean;
  authEnabled?: boolean;
  apiKeys?: string[];
  adapters?: {
    storageKind?: string;
    queueKind?: string;
  };
  uploadStorage?: {
    strategy?: "auto" | "native" | "kv";
  };
  loadItems?: (ctx: { runQuery: any; runMutation: any; req: Request }) => Promise<any[]>;
  geminiApiKey?: string | (() => string | undefined);
  defaultUserId?: string;
  buildCycleConfig?: (args: {
    settings: DevtoolsSettings;
    mode: "run" | "hard" | "soft" | "simulate";
    payload: unknown;
  }) => {
    recommendation: {
      hard: any;
      soft: string;
      max?: number;
      cache?: boolean;
      autocompletion?: boolean;
      groupByCategory?: boolean;
      backgroundRefresh?: string;
    };
    models?: {
      recommendation?: string;
      chat?: string;
      summary?: string;
    };
  };
  defaultSettings?: DevtoolsSettings | (() => DevtoolsSettings);
  chat?: {
    systemPrompt?: string | ((args: { settings: DevtoolsSettings }) => string);
    platformContext?:
      | string
      | Record<string, unknown>
      | ((args: { settings: DevtoolsSettings }) => string | Record<string, unknown>);
    toolPolicy?: "snapshot-first" | "tool-heavy" | "snapshot-only";
    createTools?:
      | ConvexToolDescriptor[]
      | ((args: { settings: DevtoolsSettings; req: Request }) => Promise<ConvexToolDescriptor[]> | ConvexToolDescriptor[]);
  };
};

const DEFAULT_SETTINGS_KEY = "devtools:settings";
const DEFAULT_RUN_STATE_KEY = "devtools:run-state";
const DEFAULT_UPLOADS_PREFIX = "devtools:uploads";

type UploadMeta = {
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

type SnapshotItem = {
  id: string;
  name: string;
  category: string;
  rank: number;
  hard_score?: number;
  llm_score?: number;
  meta?: Record<string, unknown>;
};

type RankedItem = SnapshotItem & {
  reasoning?: string;
  tags?: string[];
};

type ChatItem = {
  id: string;
  name: string;
  category: string;
  rank: number;
  tags?: string[];
  meta?: Record<string, unknown>;
};

type SimulatePayload = {
  items?: any[];
  itemsJson?: string;
  filterOptions?: {
    match?: Record<string, unknown>;
    range?: Record<string, { min?: number; max?: number }>;
    categories?: { include?: string[]; exclude?: string[] };
    tags?: { include?: string[]; exclude?: string[] };
    blocklist?: string[];
  };
  modelOverride?: {
    recommendation?: string;
    chat?: string;
    summary?: string;
  };
  userId?: string;
};

function defaultSettingsFallback(): DevtoolsSettings {
  return {
    models: {
      recommendation: "openai/gpt-4o",
      chat: "openai/gpt-4o-mini",
      summary: "anthropic/claude-haiku-4-5",
    },
    prompts: {
      recommendation:
        "You are a recommendation engine for a general-purpose e-commerce store. Prioritize items that are trending, highly reviewed, and match recent purchase patterns. Avoid near-duplicate items. Prefer category diversity unless the user shows strong category affinity.",
      chat: "You are a helpful shopping assistant. Help users find products they'll love.",
    },
    filters: {
      categories: "electronics, books, clothing",
      priceMin: 0,
      priceMax: 500,
    },
    cache: {
      refreshCron: "0 */6 * * *",
      maxItems: 200,
      kvBinding: "VEIL_KV",
      queueBinding: "VEIL_QUEUE",
    },
    features: {
      recency: 20,
      popularity: 35,
      rating: 30,
      price: 15,
    },
    toggles: {
      cache: true,
      autocompletion: true,
      groupByCategory: true,
      backgroundRefresh: true,
      diversity: true,
      priceRange: true,
      webPlugin: true,
      reviewsPlugin: true,
      socialPlugin: false,
    },
  };
}

function defaultRunStateFallback(): DevtoolsRunState {
  const nodeStates = {
    Input: "idle",
    HardScorer: "idle",
    SnapshotCache: "idle",
    GroupedReplica: "idle",
    PluginArchives: "idle",
    PluginA: "idle",
    PluginB: "idle",
    Summarizer: "idle",
    SoftRanker: "idle",
    FinalCache: "idle",
    SnapshotRanked: "idle",
    SnapshotChat: "idle",
  } as const;
  return {
    running: false,
    progress: 0,
    message: "",
    selectedNodeId: "SoftRanker",
    nodeStates: { ...nodeStates },
    updatedAt: 0,
  };
}

function envBool(name: string, fallback = false): boolean {
  const v = process.env[name];
  if (v == null) return fallback;
  return String(v).toLowerCase() === "true";
}

function envList(name: string): string[] {
  const raw = String(process.env[name] ?? "");
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function requestKey(req: Request): string | null {
  const bearer = req.headers.get("authorization");
  if (bearer && bearer.toLowerCase().startsWith("bearer ")) return bearer.slice(7).trim() || null;
  return req.headers.get("x-veil-devtools-key");
}

function buildRunState(
  patch?: Partial<DevtoolsRunState>,
  prev?: DevtoolsRunState,
): DevtoolsRunState {
  const base = prev ?? defaultRunStateFallback();
  return {
    ...base,
    ...patch,
    nodeStates: {
      ...base.nodeStates,
      ...(patch?.nodeStates ?? {}),
    },
    updatedAt: Date.now(),
  };
}

function corsHeaders(corsOrigin: string) {
  return {
    "access-control-allow-origin": corsOrigin,
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,x-veil-devtools-key",
  } as const;
}

function json(body: unknown, corsOrigin: string, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(corsOrigin),
      ...(init?.headers ?? {}),
    },
  });
}

function text(body: string, corsOrigin: string, init?: ResponseInit): Response {
  return new Response(body, { status: init?.status ?? 200, headers: { ...corsHeaders(corsOrigin), ...(init?.headers ?? {}) } });
}

function noContent(corsOrigin: string): Response {
  return new Response(null, { status: 204, headers: corsHeaders(corsOrigin) });
}

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function decodeBase64(bytesBase64: string): Uint8Array {
  const binary = atob(bytesBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function makeUploadKey(prefix: string, suffix: string): string {
  return `${prefix}:${suffix}`;
}

function sortUploads(a: UploadMeta, b: UploadMeta): number {
  return b.createdAt - a.createdAt;
}

function resolveUploadStorageMode(
  strategy: "auto" | "native" | "kv",
  storageKind: string,
): "native" | "kv" {
  if (strategy === "native") return "native";
  if (strategy === "kv") return "kv";
  return storageKind === "convex" ? "native" : "kv";
}

function getPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const parts = path.split(".").filter(Boolean);
  let current: any = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

function applyServeFilter<T extends { id: string; category?: string; tags?: string[] }>(
  items: T[],
  filter: SimulatePayload["filterOptions"] | undefined,
): T[] {
  if (!filter) return items;
  return items.filter((item) => {
    if (filter.match) {
      for (const [path, value] of Object.entries(filter.match)) {
        if (getPath(item, path) !== value) return false;
      }
    }
    if (filter.range) {
      for (const [path, bounds] of Object.entries(filter.range)) {
        const val = getPath(item, path);
        if (typeof val !== "number") return false;
        if (bounds.min !== undefined && val < bounds.min) return false;
        if (bounds.max !== undefined && val > bounds.max) return false;
      }
    }
    if (filter.categories) {
      const include = filter.categories.include ?? [];
      const exclude = filter.categories.exclude ?? [];
      if (include.length && (!item.category || !include.includes(item.category))) return false;
      if (exclude.length && item.category && exclude.includes(item.category)) return false;
    }
    if (filter.tags) {
      const itemTags = item.tags ?? [];
      const include = filter.tags.include ?? [];
      const exclude = filter.tags.exclude ?? [];
      if (include.length && !include.some((tag) => itemTags.includes(tag))) return false;
      if (exclude.length && exclude.some((tag) => itemTags.includes(tag))) return false;
    }
    if (filter.blocklist?.includes(item.id)) return false;
    return true;
  });
}

function defaultBuildCycleConfig(args: {
  settings: DevtoolsSettings;
  mode: "run" | "hard" | "soft" | "simulate";
  payload: unknown;
}) {
  const payload = (args.payload ?? {}) as SimulatePayload;
  const settings = args.settings;
  const payloadItems = Array.isArray(payload.items) ? payload.items : [];
  const allowedCategories = settings.filters.categories
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const hasPayloadItems = payloadItems.length > 0;
  const categoryMatches =
    !hasPayloadItems ||
    !allowedCategories.length ||
    payloadItems.some(
      (item) =>
        typeof item?.category === "string" && allowedCategories.includes(item.category),
    );
  const hardPolicies: any[] = [];
  if (settings.toggles.diversity) {
    hardPolicies.push({ id: "diversity", maxPerCategory: 3 });
  }
  if (settings.toggles.priceRange) {
    if (!hasPayloadItems || hasNumericPath(payloadItems, "price")) {
      hardPolicies.push({
        id: "price-range",
        field: "price",
        min: settings.filters.priceMin,
        max: settings.filters.priceMax,
      });
    }
    if (!hasPayloadItems || hasNumericPath(payloadItems, "meta.price")) {
      hardPolicies.push({
        id: "price-range",
        field: "meta.price",
        min: settings.filters.priceMin,
        max: settings.filters.priceMax,
      });
    }
  }

  return {
    recommendation: {
      hard: {
        categories: categoryMatches ? allowedCategories : [],
        features: [
          { id: "recency", field: "recency", weight: settings.features.recency / 100, normalize: "minmax" },
          { id: "rating", field: "rating", weight: settings.features.rating / 100, normalize: "minmax" },
          {
            id: "price",
            field: "price",
            weight: settings.features.price / 100,
            normalize: "minmax",
            direction: "desc",
          },
          {
            id: "meta.recency",
            field: "meta.recency",
            weight: settings.features.recency / 100,
            normalize: "minmax",
          },
          {
            id: "meta.rating",
            field: "meta.rating",
            weight: settings.features.rating / 100,
            normalize: "minmax",
          },
          {
            id: "meta.price",
            field: "meta.price",
            weight: settings.features.price / 100,
            normalize: "minmax",
            direction: "desc",
          },
        ],
        policies: hardPolicies,
      },
      soft: settings.prompts.recommendation,
      max: settings.cache.maxItems,
      cache: settings.toggles.cache,
      autocompletion: settings.toggles.autocompletion,
      groupByCategory: settings.toggles.groupByCategory,
      backgroundRefresh: settings.toggles.backgroundRefresh
        ? settings.cache.refreshCron
        : undefined,
    },
    models: {
      recommendation:
        payload.modelOverride?.recommendation ?? settings.models.recommendation,
      chat: payload.modelOverride?.chat ?? settings.models.chat,
      summary: payload.modelOverride?.summary ?? settings.models.summary,
    },
  };
}

function hasNumericPath(items: any[], path: string): boolean {
  const parts = path.split(".");
  return items.some((item) => {
    let current = item;
    for (const part of parts) {
      current = current?.[part];
    }
    return typeof current === "number" && !Number.isNaN(current);
  });
}

function toChatSnapshot(items: RankedItem[]): ChatItem[] {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    rank: item.rank,
    tags: item.tags,
    meta: item.meta,
  }));
}

function authorize(req: Request, corsOrigin: string, enabled: boolean, authEnabled: boolean, apiKeys: string[]): Response | null {
  if (!enabled) return text("Not Found", corsOrigin, { status: 404 });
  if (!authEnabled) return null;
  const key = requestKey(req);
  if (apiKeys.length === 0) return text("Devtools auth misconfigured (no API keys configured)", corsOrigin, { status: 401 });
  if (!key || !apiKeys.includes(key)) return text("Unauthorized", corsOrigin, { status: 401 });
  return null;
}

export function createDevtoolsHttpRouter(opts: CreateDevtoolsHttpRouterOptions) {
  const corsOrigin = opts.corsOrigin ?? "*";
  const enabled = opts.enabled ?? envBool("VEIL_DEVTOOLS_ENABLED", false);
  const authEnabled = opts.authEnabled ?? envBool("VEIL_DEVTOOLS_AUTH_ENABLED", false);
  const apiKeys = opts.apiKeys ?? envList("VEIL_DEVTOOLS_API_KEYS");
  const settingsKey = opts.settingsKey ?? DEFAULT_SETTINGS_KEY;
  const uploadsPrefix = opts.uploadsPrefix ?? DEFAULT_UPLOADS_PREFIX;
  const storageKind = opts.adapters?.storageKind ?? "convex";
  const queueKind = opts.adapters?.queueKind ?? "convex";
  const uploadStorageStrategy = opts.uploadStorage?.strategy ?? "auto";
  const resolveDefaultSettings = (): DevtoolsSettings =>
    typeof opts.defaultSettings === "function"
      ? opts.defaultSettings()
      : (opts.defaultSettings ?? defaultSettingsFallback());
  const resolveGeminiApiKey = (): string | undefined =>
    typeof opts.geminiApiKey === "function" ? opts.geminiApiKey() : opts.geminiApiKey;

  const http = httpRouter();

  const optionsHandler = httpActionGeneric(async () => noContent(corsOrigin));

  const readKv = async (runQuery: any, key: string): Promise<string | null> => {
    const result = (await runQuery((opts.component as any)._storage.get, { key })) as {
      value: string | null;
    };
    return result?.value ?? null;
  };

  const writeKv = async (
    runMutation: any,
    key: string,
    value: string,
    ttlSeconds: number | null = null,
  ): Promise<void> => {
    await runMutation((opts.component as any)._storage.set, { key, value, ttlSeconds });
  };

  const listKv = async (runQuery: any, prefix: string): Promise<string[]> => {
    return (await runQuery((opts.component as any)._storage.list, { prefix })) as string[];
  };

  const withAuth = (
    handler: (ctx: any) => Promise<Response>,
  ) =>
    httpActionGeneric(async (ctx: any, req: Request) => {
      const denied = authorize(req, corsOrigin, enabled, authEnabled, apiKeys);
      if (denied) return denied;
      return handler({ ...ctx, req });
    });

  const executeCycle = async (args: {
    ctx: { runQuery: any; runMutation: any; req: Request };
    mode: "run" | "hard" | "soft" | "simulate";
    items?: any[];
    payload?: unknown;
    userId?: string;
  }) => {
    const readRunState = async () =>
      safeJsonParse<DevtoolsRunState>(
        await readKv(args.ctx.runQuery, DEFAULT_RUN_STATE_KEY),
        defaultRunStateFallback(),
      );
    const writeRunState = async (patch: Partial<DevtoolsRunState>) => {
      const prev = await readRunState();
      const next = buildRunState(patch, prev);
      await writeKv(
        args.ctx.runMutation,
        DEFAULT_RUN_STATE_KEY,
        JSON.stringify(next),
        null,
      );
      return next;
    };

    try {
      const settingsRaw = await readKv(args.ctx.runQuery, settingsKey);
      const settings = safeJsonParse<DevtoolsSettings>(
        settingsRaw,
        resolveDefaultSettings(),
      );
      const cycleConfig = (opts.buildCycleConfig ?? defaultBuildCycleConfig)({
        settings,
        mode: args.mode,
        payload: args.payload ?? {},
      });

      const startedAt = Date.now();
      await writeRunState({
        running: true,
        progress: 6,
        message: "Loading input",
        selectedNodeId: "Input",
        nodeStates: { Input: "active" },
      });
      const storedHard = safeJsonParse<any[]>(
        await readKv(args.ctx.runQuery, "snapshot:hard"),
        [],
      );
      await writeRunState({
        progress: 18,
        message: "Running hard scorer",
        selectedNodeId: "HardScorer",
        nodeStates: {
          Input: "complete",
          HardScorer: "active",
        },
      });
      const hard =
        args.mode === "soft" && !args.items
          ? storedHard
          : hardScore(
              args.items ??
                (Array.isArray((args.payload as any)?.items)
                  ? ((args.payload as any).items as any[])
                  : opts.loadItems
                    ? await opts.loadItems(args.ctx)
                    : []),
              cycleConfig.recommendation.hard,
            );

      await writeRunState({
        progress: args.mode === "hard" ? 72 : 34,
        message: args.mode === "hard" ? "Persisting hard snapshot" : "Caching snapshot",
        selectedNodeId: "SnapshotCache",
        nodeStates: {
          HardScorer: "complete",
          SnapshotCache: "active",
        },
      });

      if (args.mode === "hard") {
        const meta = {
          ranAt: Date.now(),
          durationMs: Date.now() - startedAt,
          itemCount: hard.length,
          model: cycleConfig.models?.recommendation,
          stage: "hard",
        };
        await writeKv(args.ctx.runMutation, "snapshot:hard", JSON.stringify(hard), null);
        await writeKv(args.ctx.runMutation, "snapshot:meta", JSON.stringify(meta), null);
        await writeRunState({
          running: false,
          progress: 100,
          message: `Cycle complete · ${hard.length} items`,
          selectedNodeId: "SnapshotCache",
          nodeStates: {
            SnapshotCache: "complete",
          },
        });
        return { ok: true, stage: "hard", itemCount: hard.length, meta, snapshot: hard };
      }

      const apiKey = resolveGeminiApiKey();
      if (!apiKey) throw new Error("Missing Gemini API key for devtools cycle execution");

      const feedback = (await args.ctx.runQuery((opts.component as any).feedback.recent, {
        userId: args.userId ?? opts.defaultUserId ?? null,
        limit: 200,
      })) as any[];

      await writeRunState({
        progress: 52,
        message: "Preparing grouped and plugin stages",
        selectedNodeId: "PluginArchives",
        nodeStates: {
          SnapshotCache: "complete",
          GroupedReplica: "complete",
          PluginArchives: "active",
        },
      });

      await writeRunState({
        progress: 68,
        message: "Generating summaries",
        selectedNodeId: "Summarizer",
        nodeStates: {
          PluginArchives: "complete",
          PluginA: "complete",
          PluginB: "complete",
          Summarizer: "active",
        },
      });

      await writeRunState({
        progress: 82,
        message: "Running soft ranker",
        selectedNodeId: "SoftRanker",
        nodeStates: {
          Summarizer: "complete",
          SoftRanker: "active",
        },
      });

      const ranked = (await softRank({
        snapshot: hard as any[],
        config: {
          recommendation: cycleConfig.recommendation as any,
          llm: {
            recommendation: gemini(
              cycleConfig.models?.recommendation ?? settings.models.recommendation,
              { apiKey },
            ),
          },
        },
        feedback,
      })) as RankedItem[];

      const rankedWithFilter =
        args.mode === "simulate"
          ? applyServeFilter(ranked, (args.payload as SimulatePayload | undefined)?.filterOptions)
          : ranked;
      const chat = toChatSnapshot(rankedWithFilter);
      const meta = {
        ranAt: Date.now(),
        durationMs: Date.now() - startedAt,
        itemCount: hard.length,
        model: cycleConfig.models?.recommendation,
        stage: args.mode,
      };

      await writeRunState({
        progress: 92,
        message: "Writing final snapshots",
        selectedNodeId: "FinalCache",
        nodeStates: {
          SoftRanker: "complete",
          FinalCache: "active",
        },
      });

      await writeKv(args.ctx.runMutation, "snapshot:hard", JSON.stringify(hard), null);
      await writeKv(
        args.ctx.runMutation,
        "snapshot:ranked",
        JSON.stringify(rankedWithFilter),
        null,
      );
      await writeKv(args.ctx.runMutation, "snapshot:chat", JSON.stringify(chat), null);
      await writeKv(args.ctx.runMutation, "snapshot:meta", JSON.stringify(meta), null);
      await writeRunState({
        running: false,
        progress: 100,
        message: `Cycle complete · ${hard.length} items`,
        selectedNodeId: "SnapshotRanked",
        nodeStates: {
          FinalCache: "complete",
          SnapshotRanked: "complete",
          SnapshotChat: "complete",
        },
      });

      return {
        ok: true,
        stage: args.mode,
        itemCount: hard.length,
        meta,
        snapshot: rankedWithFilter,
        chat,
      };
    } catch (error) {
      await writeRunState({
        running: false,
        progress: 0,
        message:
          error instanceof Error ? `Cycle failed · ${error.message}` : "Cycle failed",
        nodeStates: {
          Input: "error",
          HardScorer: "error",
          SnapshotCache: "error",
          GroupedReplica: "error",
          PluginArchives: "error",
          PluginA: "error",
          PluginB: "error",
          Summarizer: "error",
          SoftRanker: "error",
          FinalCache: "error",
          SnapshotRanked: "error",
          SnapshotChat: "error",
        },
      });
      throw error;
    }
  };

  http.route({
    path: "/api/devtools/settings",
    method: "OPTIONS",
    handler: optionsHandler,
  });

  http.route({
    path: "/api/devtools/status",
    method: "OPTIONS",
    handler: optionsHandler,
  });

  http.route({
    path: "/api/devtools/snapshot",
    method: "OPTIONS",
    handler: optionsHandler,
  });

  http.route({
    path: "/api/devtools/plugins",
    method: "OPTIONS",
    handler: optionsHandler,
  });

  http.route({
    path: "/api/devtools/adapters",
    method: "OPTIONS",
    handler: optionsHandler,
  });

  http.route({
    path: "/api/devtools/tables",
    method: "OPTIONS",
    handler: optionsHandler,
  });

  http.route({
    path: "/api/devtools/simulate",
    method: "OPTIONS",
    handler: optionsHandler,
  });

  http.route({
    path: "/api/devtools/uploads",
    method: "OPTIONS",
    handler: optionsHandler,
  });

  http.route({
    path: "/api/devtools/uploads/content",
    method: "OPTIONS",
    handler: optionsHandler,
  });

  http.route({
    path: "/api/devtools/stream",
    method: "OPTIONS",
    handler: optionsHandler,
  });

  http.route({
    path: "/api/devtools/chat/thread",
    method: "OPTIONS",
    handler: optionsHandler,
  });

  http.route({
    path: "/api/devtools/chat/messages",
    method: "OPTIONS",
    handler: optionsHandler,
  });

  http.route({
    path: "/api/devtools/chat/threads",
    method: "OPTIONS",
    handler: optionsHandler,
  });

  http.route({
    path: "/api/devtools/chat/respond",
    method: "OPTIONS",
    handler: optionsHandler,
  });

  http.route({
    path: "/api/devtools/cycle/run",
    method: "OPTIONS",
    handler: optionsHandler,
  });

  http.route({
    path: "/api/devtools/cycle/hard",
    method: "OPTIONS",
    handler: optionsHandler,
  });

  http.route({
    path: "/api/devtools/cycle/soft",
    method: "OPTIONS",
    handler: optionsHandler,
  });

  http.route({
    path: "/api/devtools/settings",
    method: "GET",
    handler: withAuth(async ({ runQuery }) => {
      const raw = await readKv(runQuery, settingsKey);
      return json(safeJsonParse<DevtoolsSettings>(raw, resolveDefaultSettings()), corsOrigin);
    }),
  });

  http.route({
    path: "/api/devtools/settings",
    method: "PUT",
    handler: withAuth(async ({ runMutation, req }) => {
      const body = (await req.json()) as DevtoolsSettings;
      await writeKv(runMutation, settingsKey, JSON.stringify(body), null);
      return json(body, corsOrigin);
    }),
  });

  http.route({
    path: "/api/devtools/status",
    method: "GET",
    handler: withAuth(async ({ runQuery }) => {
      const meta = safeJsonParse<Record<string, unknown>>(await readKv(runQuery, "snapshot:meta"), {});
      const ranked = safeJsonParse<unknown[]>(await readKv(runQuery, "snapshot:ranked"), []);
      const uploads = await listKv(runQuery, makeUploadKey(uploadsPrefix, "meta:"));
      const runState = safeJsonParse<DevtoolsRunState>(
        await readKv(runQuery, DEFAULT_RUN_STATE_KEY),
        defaultRunStateFallback(),
      );

      return json(
        {
          healthy: true,
          cacheAge: meta.ranAt ? `${Math.max(0, Date.now() - Number(meta.ranAt))}ms` : "n/a",
          lastRan: typeof meta.ranAt === "number" ? new Date(meta.ranAt).toISOString() : undefined,
          durationMs: typeof meta.durationMs === "number" ? meta.durationMs : undefined,
          itemCount: typeof meta.itemCount === "number" ? meta.itemCount : ranked.length,
          model: typeof meta.model === "string" ? meta.model : undefined,
          plugins: [],
          uploadCount: uploads.length,
          runState,
        },
        corsOrigin,
      );
    }),
  });

  http.route({
    path: "/api/devtools/snapshot",
    method: "GET",
    handler: withAuth(async ({ runQuery }) => {
      const ranked = safeJsonParse<SnapshotItem[]>(
        await readKv(runQuery, "snapshot:ranked"),
        [],
      );
      return json(ranked, corsOrigin);
    }),
  });

  http.route({
    path: "/api/devtools/plugins",
    method: "GET",
    handler: withAuth(async () => json([], corsOrigin)),
  });

  http.route({
    path: "/api/devtools/adapters",
    method: "GET",
    handler: withAuth(async () =>
      json(
        {
          storage: { kind: storageKind },
          queue: { kind: queueKind },
        },
        corsOrigin,
      ),
    ),
  });

  http.route({
    path: "/api/devtools/tables",
    method: "GET",
    handler: withAuth(async ({ runQuery }) => {
      const keys = await listKv(runQuery, "snapshot:");
      const tables = await Promise.all(
        keys.sort().map(async (key) => ({
          key,
          value: safeJsonParse<unknown>(await readKv(runQuery, key), null),
        })),
      );
      return json(tables, corsOrigin);
    }),
  });

  http.route({
    path: "/api/devtools/simulate",
    method: "POST",
    handler: withAuth(async ({ runQuery, runMutation, req }) => {
      const payload = (await req.json()) as SimulatePayload;
      const parsedItems = Array.isArray(payload.items)
        ? payload.items
        : typeof payload.itemsJson === "string" && payload.itemsJson.trim()
          ? safeJsonParse<any[]>(payload.itemsJson, [])
          : [];
      const result = await executeCycle({
        ctx: { runQuery, runMutation, req },
        mode: "simulate",
        items: parsedItems,
        payload,
        userId: payload.userId,
      });
      return json(result, corsOrigin);
    }),
  });

  http.route({
    path: "/api/devtools/uploads",
    method: "POST",
    handler: withAuth(async ({ runMutation, req, storage }) => {
      const body = (await req.json()) as {
        filename: string;
        mime: string | null;
        bytesBase64: string;
      };

      const createdAt = Date.now();
      const id = typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `upload_${createdAt}`;
      const bytes = decodeBase64(body.bytesBase64);
      const uploadStorageMode = resolveUploadStorageMode(
        uploadStorageStrategy,
        storageKind,
      );
      let storageFileId: string | null = null;

      if (uploadStorageMode === "native") {
        const uploadBuffer = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer;
        const blob = new Blob([uploadBuffer], {
          type: body.mime || "application/octet-stream",
        });
        storageFileId = await storage.store(blob);
      }

      const meta: UploadMeta = {
        id,
        filename: body.filename,
        mime: body.mime ?? null,
        sizeBytes: bytes.byteLength,
        sha256: await sha256Hex(bytes),
        createdAt,
        storageKind,
        storageMode: uploadStorageMode,
        storageFileId,
      };

      await writeKv(
        runMutation,
        makeUploadKey(uploadsPrefix, `meta:${id}`),
        JSON.stringify(meta),
        null,
      );
      if (uploadStorageMode === "kv") {
        await writeKv(
          runMutation,
          makeUploadKey(uploadsPrefix, `content:${id}`),
          body.bytesBase64,
          null,
        );
      }

      return json(meta, corsOrigin);
    }),
  });

  http.route({
    path: "/api/devtools/uploads",
    method: "GET",
    handler: withAuth(async ({ runQuery }) => {
      const keys = await listKv(runQuery, makeUploadKey(uploadsPrefix, "meta:"));
      const uploads = await Promise.all(
        keys.map(async (key) =>
          safeJsonParse<UploadMeta>(await readKv(runQuery, key), null as never),
        ),
      );
      return json(uploads.filter(Boolean).sort(sortUploads), corsOrigin);
    }),
  });

  http.route({
    path: "/api/devtools/uploads",
    method: "PUT",
    handler: withAuth(async ({ runQuery, runMutation, storage, req }) => {
      const url = new URL(req.url);
      const id = url.searchParams.get("id");
      if (!id) return text("Missing upload id", corsOrigin, { status: 400 });

      const body = (await req.json()) as {
        filename: string;
        mime: string | null;
        bytesBase64: string;
      };

      const metaKey = makeUploadKey(uploadsPrefix, `meta:${id}`);
      const contentKey = makeUploadKey(uploadsPrefix, `content:${id}`);
      const existing = safeJsonParse<UploadMeta>(
        await readKv(runQuery, metaKey),
        null as never,
      );
      if (!existing) return text("Upload not found", corsOrigin, { status: 404 });

      const bytes = decodeBase64(body.bytesBase64);
      const uploadStorageMode =
        existing.storageMode ?? resolveUploadStorageMode(uploadStorageStrategy, storageKind);
      let storageFileId = existing.storageFileId ?? null;

      if (uploadStorageMode === "native") {
        if (existing.storageFileId) {
          await storage.delete(existing.storageFileId as any);
        }
        const uploadBuffer = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer;
        const blob = new Blob([uploadBuffer], {
          type: body.mime || "application/octet-stream",
        });
        storageFileId = await storage.store(blob);
      }

      const meta: UploadMeta = {
        ...existing,
        filename: body.filename,
        mime: body.mime ?? null,
        sizeBytes: bytes.byteLength,
        sha256: await sha256Hex(bytes),
        storageMode: uploadStorageMode,
        storageFileId,
      };

      await writeKv(runMutation, metaKey, JSON.stringify(meta), null);
      if (uploadStorageMode === "kv") {
        await writeKv(runMutation, contentKey, body.bytesBase64, null);
      } else {
        await runMutation((opts.component as any)._storage.delete_, { key: contentKey });
      }

      return json(meta, corsOrigin);
    }),
  });

  http.route({
    path: "/api/devtools/uploads",
    method: "DELETE",
    handler: withAuth(async ({ runQuery, runMutation, storage, req }) => {
      const url = new URL(req.url);
      const id = url.searchParams.get("id");
      if (!id) return text("Missing upload id", corsOrigin, { status: 400 });

      const metaKey = makeUploadKey(uploadsPrefix, `meta:${id}`);
      const contentKey = makeUploadKey(uploadsPrefix, `content:${id}`);
      const meta = safeJsonParse<UploadMeta>(
        await readKv(runQuery, metaKey),
        null as never,
      );
      if (!meta) return text("Upload not found", corsOrigin, { status: 404 });

      if (meta.storageMode === "native" && meta.storageFileId) {
        await storage.delete(meta.storageFileId as any);
      }

      await runMutation((opts.component as any)._storage.delete_, { key: metaKey });
      await runMutation((opts.component as any)._storage.delete_, { key: contentKey });

      return noContent(corsOrigin);
    }),
  });

  http.route({
    path: "/api/devtools/uploads/content",
    method: "GET",
    handler: withAuth(async ({ runQuery, storage, req }) => {
      const url = new URL(req.url);
      const id = url.searchParams.get("id");
      if (!id) return text("Missing upload id", corsOrigin, { status: 400 });

      const meta = safeJsonParse<UploadMeta>(
        await readKv(runQuery, makeUploadKey(uploadsPrefix, `meta:${id}`)),
        null as never,
      );
      if (!meta) return text("Upload not found", corsOrigin, { status: 404 });

      let bytesBase64: string | null = null;
      if (meta.storageMode === "native" && meta.storageFileId) {
        const blob = await storage.get(meta.storageFileId as any);
        if (!blob) return text("Stored file missing", corsOrigin, { status: 404 });
        const arr = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        const chunkSize = 0x8000;
        for (let i = 0; i < arr.length; i += chunkSize) {
          const chunk = arr.subarray(i, i + chunkSize);
          binary += String.fromCharCode(...chunk);
        }
        bytesBase64 = btoa(binary);
      } else {
        bytesBase64 = await readKv(runQuery, makeUploadKey(uploadsPrefix, `content:${id}`));
      }

      if (!bytesBase64) return text("Upload content missing", corsOrigin, { status: 404 });

      return json(
        {
          id: meta.id,
          filename: meta.filename,
          mime: meta.mime,
          bytesBase64,
        },
        corsOrigin,
      );
    }),
  });

  http.route({
    path: "/api/devtools/stream",
    method: "GET",
    handler: withAuth(async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const send = (data: unknown) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          };
          send({ type: "cycle:end", ts: Date.now(), ok: true });
          controller.close();
        },
      });

      return new Response(stream, {
        status: 200,
        headers: {
          ...corsHeaders(corsOrigin),
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
        },
      });
    }),
  });

  http.route({
    path: "/api/devtools/chat/thread",
    method: "POST",
    handler: withAuth(async ({ runQuery, runMutation, req }) => {
      const body = (await req.json().catch(() => ({}))) as {
        userId?: string;
        title?: string;
        metadata?: Record<string, unknown>;
      };
      const runtime = createChatRuntime({
        config: {
          recommendation: { hard: {} as any, soft: "" },
          llm: {},
          storage: createConvexStorageAdapter(
            { runQuery, runMutation },
            {
              get: (opts.component as any)._storage.get,
              set: (opts.component as any)._storage.set,
              delete: (opts.component as any)._storage.delete_,
              list: (opts.component as any)._storage.list,
            },
          ),
          chatRepository: createConvexChatRepository(
            { runQuery, runMutation },
            {
              createThread: (opts.component as any).chat_threads.create,
              getThread: (opts.component as any).chat_threads.get,
              appendMessages: (opts.component as any).chat_messages.append,
              listMessages: (opts.component as any).chat_messages.listByThread,
              createRun: (opts.component as any).chat_runs.create,
              completeRun: (opts.component as any).chat_runs.complete,
              failRun: (opts.component as any).chat_runs.fail,
            },
          ),
          chat: { enabled: false },
        } as any,
      });

      const thread = await runtime.createThread({
        userId: body.userId ?? opts.defaultUserId,
        title: body.title,
        metadata: body.metadata,
      });

      return json(thread, corsOrigin);
    }),
  });

  http.route({
    path: "/api/devtools/chat/messages",
    method: "GET",
    handler: withAuth(async ({ runQuery, runMutation, req }) => {
      const url = new URL(req.url);
      const threadId = url.searchParams.get("threadId");
      if (!threadId) return text("Missing threadId", corsOrigin, { status: 400 });

      const runtime = createChatRuntime({
        config: {
          recommendation: { hard: {} as any, soft: "" },
          llm: {},
          storage: createConvexStorageAdapter(
            { runQuery, runMutation },
            {
              get: (opts.component as any)._storage.get,
              set: (opts.component as any)._storage.set,
              delete: (opts.component as any)._storage.delete_,
              list: (opts.component as any)._storage.list,
            },
          ),
          chatRepository: createConvexChatRepository(
            { runQuery, runMutation },
            {
              createThread: (opts.component as any).chat_threads.create,
              getThread: (opts.component as any).chat_threads.get,
              appendMessages: (opts.component as any).chat_messages.append,
              listMessages: (opts.component as any).chat_messages.listByThread,
              createRun: (opts.component as any).chat_runs.create,
              completeRun: (opts.component as any).chat_runs.complete,
              failRun: (opts.component as any).chat_runs.fail,
            },
          ),
          chat: { enabled: false },
        } as any,
      });

      const messages = await runtime.listMessages(threadId);
      return json(messages, corsOrigin);
    }),
  });

  http.route({
    path: "/api/devtools/chat/threads",
    method: "GET",
    handler: withAuth(async ({ runQuery, runMutation, req }) => {
      const url = new URL(req.url);
      const userId = url.searchParams.get("userId");
      const limitRaw = url.searchParams.get("limit");
      const limit = limitRaw ? Number(limitRaw) : 50;

      const runtime = createChatRuntime({
        config: {
          recommendation: { hard: {} as any, soft: "" },
          llm: {},
          storage: createConvexStorageAdapter(
            { runQuery, runMutation },
            {
              get: (opts.component as any)._storage.get,
              set: (opts.component as any)._storage.set,
              delete: (opts.component as any)._storage.delete_,
              list: (opts.component as any)._storage.list,
            },
          ),
          chatRepository: createConvexChatRepository(
            { runQuery, runMutation },
            {
              createThread: (opts.component as any).chat_threads.create,
              getThread: (opts.component as any).chat_threads.get,
              listThreads: (opts.component as any).chat_threads.list,
              appendMessages: (opts.component as any).chat_messages.append,
              listMessages: (opts.component as any).chat_messages.listByThread,
              createRun: (opts.component as any).chat_runs.create,
              completeRun: (opts.component as any).chat_runs.complete,
              failRun: (opts.component as any).chat_runs.fail,
            },
          ),
          chat: { enabled: false },
        } as any,
      });

      const threads = await runtime.listThreads({
        userId: userId ?? undefined,
        limit: Number.isFinite(limit) ? limit : 50,
      });
      return json(threads, corsOrigin);
    }),
  });

  http.route({
    path: "/api/devtools/chat/respond",
    method: "POST",
    handler: withAuth(async ({ runQuery, runMutation, runAction, req }) => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const send = (data: unknown) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          };

          void (async () => {
            try {
              const body = (await req.json().catch(() => ({}))) as {
                threadId?: string;
                userId?: string;
                title?: string;
                message?: string;
                metadata?: Record<string, unknown>;
              };

              const message = body.message?.trim();
              if (!message) {
                send({ type: "error", error: "Missing message" });
                controller.close();
                return;
              }

              const settings = safeJsonParse<DevtoolsSettings>(
                await readKv(runQuery, settingsKey),
                resolveDefaultSettings(),
              );
              const apiKey = resolveGeminiApiKey();
              if (!apiKey) {
                send({ type: "error", error: "Missing Gemini API key" });
                controller.close();
                return;
              }

              const toolDefs =
                typeof opts.chat?.createTools === "function"
                  ? await opts.chat.createTools({ settings, req })
                  : (opts.chat?.createTools ?? []);

              const runtime = createChatRuntime({
                config: {
                  recommendation: { hard: {} as any, soft: "" },
                  llm: {
                    chat: gemini(settings.models.chat, { apiKey }),
                  },
                  storage: createConvexStorageAdapter(
                    { runQuery, runMutation },
                    {
                      get: (opts.component as any)._storage.get,
                      set: (opts.component as any)._storage.set,
                      delete: (opts.component as any)._storage.delete_,
                      list: (opts.component as any)._storage.list,
                    },
                  ),
                  chatRepository: createConvexChatRepository(
                    { runQuery, runMutation },
                    {
                      createThread: (opts.component as any).chat_threads.create,
                      getThread: (opts.component as any).chat_threads.get,
                      listThreads: (opts.component as any).chat_threads.list,
                      appendMessages: (opts.component as any).chat_messages.append,
                      listMessages: (opts.component as any).chat_messages.listByThread,
                      createRun: (opts.component as any).chat_runs.create,
                      completeRun: (opts.component as any).chat_runs.complete,
                      failRun: (opts.component as any).chat_runs.fail,
                    },
                  ),
                  chatTools: buildConvexTools({ runQuery, runMutation, runAction }, toolDefs),
                  chat: {
                    enabled: true,
                    systemPrompt:
                      typeof opts.chat?.systemPrompt === "function"
                        ? opts.chat.systemPrompt({ settings })
                        : (opts.chat?.systemPrompt ?? settings.prompts.chat),
                    platformContext:
                      typeof opts.chat?.platformContext === "function"
                        ? opts.chat.platformContext({ settings })
                        : opts.chat?.platformContext,
                    toolPolicy: opts.chat?.toolPolicy ?? "snapshot-first",
                  },
                } as any,
              });

              let threadId = body.threadId;
              if (!threadId) {
                const thread = await runtime.createThread({
                  userId: body.userId ?? opts.defaultUserId,
                  title: body.title ?? "Devtools chat",
                  metadata: {
                    source: "devtools-http",
                    ...(body.metadata ?? {}),
                  },
                });
                threadId = thread.id;
              }

              const result = await runtime.respond({
                threadId,
                userId: body.userId ?? opts.defaultUserId,
                message,
                metadata: body.metadata,
                onTextDelta: async (textDelta: string) => {
                  send({ type: "text-delta", text: textDelta });
                },
                onToolEvent: async (event: any) => {
                  send({ type: "tool-event", ...event });
                },
              } as any);
              send({
                type: "meta",
                threadId: result.threadId,
                runId: result.runId,
              });
              await readTextStream(result.stream);
              send({
                type: "done",
                threadId: result.threadId,
                runId: result.runId,
              });
            } catch (error) {
              const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
              send({ type: "error", error: message });
            } finally {
              controller.close();
            }
          })();
        },
      });

      return new Response(stream, {
        status: 200,
        headers: {
          ...corsHeaders(corsOrigin),
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
        },
      });
    }),
  });

  http.route({
    path: "/api/devtools/cycle/run",
    method: "POST",
    handler: withAuth(async ({ runQuery, runMutation, req }) => {
      const payload = await req.json().catch(() => ({}));
      const result = await executeCycle({
        ctx: { runQuery, runMutation, req },
        mode: "run",
        payload,
        userId:
          typeof payload?.userId === "string" ? payload.userId : opts.defaultUserId,
      });
      return json(result, corsOrigin);
    }),
  });

  http.route({
    path: "/api/devtools/cycle/hard",
    method: "POST",
    handler: withAuth(async ({ runQuery, runMutation, req }) => {
      const payload = await req.json().catch(() => ({}));
      const result = await executeCycle({
        ctx: { runQuery, runMutation, req },
        mode: "hard",
        payload,
        userId:
          typeof payload?.userId === "string" ? payload.userId : opts.defaultUserId,
      });
      return json(result, corsOrigin);
    }),
  });

  http.route({
    path: "/api/devtools/cycle/soft",
    method: "POST",
    handler: withAuth(async ({ runQuery, runMutation, req }) => {
      const payload = await req.json().catch(() => ({}));
      const result = await executeCycle({
        ctx: { runQuery, runMutation, req },
        mode: "soft",
        payload,
        userId:
          typeof payload?.userId === "string" ? payload.userId : opts.defaultUserId,
      });
      return json(result, corsOrigin);
    }),
  });

  return http;
}
