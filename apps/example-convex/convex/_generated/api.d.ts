/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

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
      respond: FunctionReference<
        "action",
        "internal",
        { geminiApiKey: string; messages: Array<any>; model?: string },
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
