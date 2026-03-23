import type { LLMRoleConfig } from "./config.js";
import type { VeilItem } from "./item.js";
import type { StorageAdapter } from "./storage.js";
import type { UserContext } from "./user.js";

export type PluginSignalValue = number | string | boolean;

export type PluginSignal = {
  itemId: string;
  namespace: string;
  features: Record<string, PluginSignalValue>;
  ts: number;
};

export type PluginFeatureMap = Record<string, number>;

export type PluginSignalSnapshot = {
  byItem: Record<string, PluginFeatureMap>;
  stats: Record<string, { min?: number; max?: number; mean?: number; stdDev?: number }>;
  signalCount: number;
  namespaces: string[];
};

export type PluginSignalContext = {
  items: VeilItem[];
  storage: StorageAdapter;
  llm: LLMRoleConfig;
  env?: Record<string, string>;
  user?: UserContext;
  now?: number;
};

export type VeilPlugin = {
  id: string;
  version: string;
  collectSignals?: (ctx: PluginSignalContext) => Promise<PluginSignal[]>;
};
