import type { CandidateRetrievalResult } from "../types/retrieval.js";
import type { VeilItem } from "../types/item.js";
import type { RetrievalConfig } from "../types/retrieval.js";
import type { UserContext } from "../types/user.js";
import type { VectorAdapter, VectorScoredItem } from "../types/vector.js";
import { getPath } from "../utils/getPath.js";

export async function retrieveCandidates(args: {
  items: VeilItem[];
  retrieval?: RetrievalConfig;
  vector?: VectorAdapter;
  user?: UserContext;
}): Promise<CandidateRetrievalResult> {
  const retrieval = args.retrieval;
  if (!retrieval?.enabled && !args.user?.queryEmbedding) {
    return {
      items: args.items,
      vectorScores: undefined,
      retrievedCount: args.items.length,
    };
  }

  if (retrieval?.candidateRetriever) {
    return retrieval.candidateRetriever({
      items: args.items,
      user: args.user,
      vector: args.vector,
      topK: retrieval.topK,
      minScore: retrieval.minScore,
      embeddingField: retrieval.embeddingField,
    });
  }

  const queryEmbedding = args.user?.queryEmbedding;
  if (!queryEmbedding?.length) {
    return {
      items: args.items,
      vectorScores: undefined,
      retrievedCount: args.items.length,
    };
  }

  const topK = retrieval?.topK ?? args.items.length;
  const minScore = retrieval?.minScore ?? Number.NEGATIVE_INFINITY;
  const embeddingField = retrieval?.embeddingField ?? "embedding";
  const scored = await scoreItemsWithVector({
    items: args.items,
    vector: args.vector,
    query: {
      embedding: queryEmbedding,
      topK,
      minScore,
      embeddingField,
    },
  });

  const vectorScores = Object.fromEntries(scored.map((entry) => [entry.id, entry.score]));
  const selectedIds = new Set(scored.map((entry) => entry.id));
  const selectedItems = args.items.filter((item) => selectedIds.has(item.id));

  return {
    items: selectedItems,
    vectorScores,
    retrievedCount: selectedItems.length,
  };
}

export async function scoreItemsWithVector(args: {
  items: VeilItem[];
  vector?: VectorAdapter;
  query: {
    embedding: number[];
    topK?: number;
    minScore?: number;
    embeddingField?: string;
  };
}): Promise<VectorScoredItem[]> {
  const topK = args.query.topK ?? args.items.length;
  const minScore = args.query.minScore ?? Number.NEGATIVE_INFINITY;

  const scores = args.vector?.scoreItems
    ? await args.vector.scoreItems({
        items: args.items,
        query: args.query,
      })
    : scoreItemsInMemory(args.items, args.query.embedding, args.query.embeddingField ?? "embedding");

  return scores
    .filter((entry) => entry.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

function scoreItemsInMemory(
  items: VeilItem[],
  queryEmbedding: number[],
  embeddingField: string,
): VectorScoredItem[] {
  const scored: VectorScoredItem[] = [];
  for (const item of items) {
    const raw = getPath(item, embeddingField);
    if (!Array.isArray(raw)) continue;
    const embedding = raw.filter((value): value is number => typeof value === "number");
    if (embedding.length !== queryEmbedding.length) continue;
    scored.push({
      id: item.id,
      score: cosineSimilarity(queryEmbedding, embedding),
    });
  }
  return scored;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
