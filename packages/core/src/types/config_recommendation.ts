import type { HardFeatureConfig, ScoringPolicy, StatsSnapshot } from "./scoring.js";

export type HardFilterOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "nin";

export type HardFilter =
  | { field: string; op: "eq" | "neq"; value: unknown }
  | { field: string; op: "gt" | "gte" | "lt" | "lte"; value: number }
  | { field: string; op: "in" | "nin"; value: unknown[] };

export type HardConfig = {
  categories?: string[];
  features?: HardFeatureConfig[];
  stats?: StatsSnapshot;
  filters?: HardFilter[];
  policies?: ScoringPolicy[];
};
