import type { VeilItem } from "./item.js";

export type VectorScoredItem = {
  id: string;
  score: number;
};

export type VectorQuery = {
  embedding: number[];
  topK?: number;
  minScore?: number;
  embeddingField?: string;
};

export type VectorAdapter = {
  scoreItems?: (args: {
    items: VeilItem[];
    query: VectorQuery;
  }) => Promise<VectorScoredItem[]>;
};
