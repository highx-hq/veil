import type { QueueAdapter } from "./queue.js";
import type { StorageAdapter } from "./storage.js";
import type { VeilLanguageModel } from "./llm.js";
import type { HardConfig } from "./config_recommendation.js";
import type { ChatConfig } from "./config_chat.js";
import type { ChatRepository, VeilChatTool, VeilChatToolProvider } from "./chat.js";
import type { VeilPlugin } from "./plugin.js";
import type { LearnedConfig } from "./learned.js";
import type { RetrievalConfig } from "./retrieval.js";
import type { VectorAdapter } from "./vector.js";

export type VeilConfig = {
  recommendation: RecommendationConfig;
  llm: LLMRoleConfig;
  storage: StorageAdapter;
  queue?: QueueAdapter;
  chat?: ChatConfig;
  chatTools?: VeilChatTool[];
  chatToolProviders?: VeilChatToolProvider[];
  chatRepository?: ChatRepository;
  plugins?: VeilPlugin[];
  retrieval?: RetrievalConfig;
  vector?: VectorAdapter;
  learned?: LearnedConfig;
  env?: Record<string, string>;
};

export type RecommendationConfig = {
  hard: HardConfig;
  soft: string;
  max?: number;
  cache?: boolean;
  autocompletion?: boolean;
  groupByCategory?: boolean;
  backgroundRefresh?: string;
};

export type LLMRoleConfig = {
  recommendation: VeilLanguageModel;
  chat?: VeilLanguageModel;
  summary?: VeilLanguageModel;
};

export type { HardConfig } from "./config_recommendation.js";
export type { ChatConfig } from "./config_chat.js";
