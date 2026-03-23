/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as chat from "../chat.js";
import type * as chat_tools from "../chat_tools.js";
import type * as http from "../http.js";
import type * as items from "../items.js";
import type * as products from "../products.js";
import type * as recommendations from "../recommendations.js";
import type * as veil from "../veil.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  chat: typeof chat;
  chat_tools: typeof chat_tools;
  http: typeof http;
  items: typeof items;
  products: typeof products;
  recommendations: typeof recommendations;
  veil: typeof veil;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  veil: {
    _storage: {
      delete_: FunctionReference<"mutation", "internal", { key: string }, any>;
      get: FunctionReference<"query", "internal", { key: string }, any>;
      list: FunctionReference<"query", "internal", { prefix: string }, any>;
      set: FunctionReference<
        "mutation",
        "internal",
        { key: string; ttlSeconds: number | null; value: string },
        any
      >;
      writeSnapshots: FunctionReference<
        "mutation",
        "internal",
        {
          chat: string;
          groupByCategory: boolean;
          hard: string;
          meta: string;
          ranked: string;
        },
        any
      >;
    };
    chat: {
      createThread: FunctionReference<
        "action",
        "internal",
        { metadata?: any; title?: string; userId?: string },
        any
      >;
      listMessages: FunctionReference<
        "query",
        "internal",
        { threadId: string },
        any
      >;
      listThreads: FunctionReference<
        "query",
        "internal",
        { limit?: number; userId?: string },
        any
      >;
      respond: FunctionReference<
        "action",
        "internal",
        {
          geminiApiKey: string;
          maxSnapshotItems?: number;
          message: string;
          metadata?: any;
          model?: string;
          platformContext?: any;
          snapshotKey?: string;
          systemPrompt?: string;
          threadId: string;
          toolPolicy?: "snapshot-first" | "tool-heavy" | "snapshot-only";
          tools?: Array<{
            description: string;
            handler: string;
            inputSchema: any;
            kind: "query" | "mutation" | "action";
            name: string;
          }>;
          userId?: string;
        },
        any
      >;
    };
    chat_messages: {
      append: FunctionReference<
        "mutation",
        "internal",
        {
          messages: Array<{
            createdAt: number;
            id: string;
            parts: any;
            role: "system" | "user" | "assistant" | "tool";
            runId?: string | null;
            threadId: string;
            toolName?: string | null;
            visible: boolean;
          }>;
        },
        any
      >;
      listByThread: FunctionReference<
        "query",
        "internal",
        { threadId: string },
        any
      >;
    };
    chat_runs: {
      complete: FunctionReference<
        "mutation",
        "internal",
        { metadata?: any | null; runId: string },
        any
      >;
      create: FunctionReference<
        "mutation",
        "internal",
        {
          metadata?: any | null;
          snapshotKey: string;
          snapshotVersion?: string | null;
          threadId: string;
          toolPolicy: "snapshot-first" | "tool-heavy" | "snapshot-only";
        },
        any
      >;
      fail: FunctionReference<
        "mutation",
        "internal",
        { metadata?: any | null; runId: string },
        any
      >;
    };
    chat_threads: {
      create: FunctionReference<
        "mutation",
        "internal",
        {
          metadata?: any | null;
          title?: string | null;
          userId?: string | null;
        },
        any
      >;
      get: FunctionReference<"query", "internal", { threadId: string }, any>;
      list: FunctionReference<
        "query",
        "internal",
        { limit?: number; userId?: string | null },
        any
      >;
      touch: FunctionReference<
        "mutation",
        "internal",
        { threadId: string; updatedAt: number },
        any
      >;
    };
    cycle: {
      run: FunctionReference<
        "action",
        "internal",
        {
          config: {
            models?: {
              chat?: string;
              recommendation?: string;
              summary?: string;
            };
            recommendation: {
              autocompletion?: boolean;
              backgroundRefresh?: string;
              cache?: boolean;
              groupByCategory?: boolean;
              hard: any;
              max?: number;
              soft: string;
            };
          };
          feedbackLimit?: number;
          geminiApiKey: string;
          items: Array<any>;
          userId?: string;
        },
        any
      >;
    };
    feedback: {
      recent: FunctionReference<
        "query",
        "internal",
        { limit?: number; userId?: string },
        any
      >;
      record: FunctionReference<
        "mutation",
        "internal",
        {
          event: "view" | "click" | "purchase" | "skip" | "dwell" | "dislike";
          itemId: string;
          meta?: any;
          score?: number;
          userId: string;
        },
        any
      >;
    };
    queue: {
      batch: FunctionReference<
        "mutation",
        "internal",
        { delayMs?: number; messages: Array<any> },
        any
      >;
      enqueue: FunctionReference<
        "mutation",
        "internal",
        { delayMs?: number; message: any },
        any
      >;
      process: FunctionReference<"mutation", "internal", { message: any }, any>;
    };
    recommend: {
      get: FunctionReference<
        "query",
        "internal",
        { filter?: any; limit?: number; offset?: number },
        any
      >;
    };
  };
};
