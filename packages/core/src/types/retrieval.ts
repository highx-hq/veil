import type { VeilItem } from "./item.js";
import type { UserContext } from "./user.js";
import type { VectorAdapter } from "./vector.js";

export type CandidateRetrievalResult = {
  items: VeilItem[];
  vectorScores?: Record<string, number>;
  retrievedCount: number;
};

export type CandidateRetriever = (args: {
  items: VeilItem[];
  user?: UserContext;
  vector?: VectorAdapter;
  topK?: number;
  minScore?: number;
  embeddingField?: string;
}) => Promise<CandidateRetrievalResult>;

export type RetrievalConfig = {
  enabled?: boolean;
  topK?: number;
  minScore?: number;
  embeddingField?: string;
  candidateRetriever?: CandidateRetriever;
};
