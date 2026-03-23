export type VeilItem = {
  id: string;
  name: string;
  category: string;
  tags?: string[];
  [key: string]: unknown;
};

export type VeilCacheItem = {
  id: string;
  name: string;
  category: string;
  hard_score: number;
  tags?: string[];
  meta?: Record<string, string | number | boolean>;
};

export type VeilRankedItem = {
  id: string;
  name: string;
  category: string;
  hard_score: number;
  llm_score: number;
  rank: number;
  tags?: string[];
  meta?: Record<string, string | number | boolean>;
  reasoning: string;
};

export type VeilChatItem = {
  id: string;
  name: string;
  category: string;
  rank: number;
  tags?: string[];
  meta?: Record<string, string | number | boolean>;
};

export type VeilFeedback = {
  itemId: string;
  event: "view" | "click" | "purchase" | "skip" | "dwell" | "dislike";
  score: number;
  ts: number;
  meta?: Record<string, unknown>;
};

