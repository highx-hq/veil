import type { VeilRankedItem } from "./item.js";

export type ServeOptions = {
  limit?: number;
  offset?: number;
  filter?: ServeFilter;
};

export type ServeFilter = {
  match?: Record<string, unknown>;
  range?: Record<string, { min?: number; max?: number }>;
  categories?: { include?: string[]; exclude?: string[] };
  tags?: { include?: string[]; exclude?: string[] };
  blocklist?: string[];
  custom?: (item: VeilRankedItem) => boolean;
};

