import type { VeilConfig } from "./types/index.js";
import { createCycleApi } from "./api/cycle.js";
import { createRecommendApi } from "./api/recommend.js";

export function createVeil(config: VeilConfig) {
  const cycle = createCycleApi(config, config.storage);
  const recommend = createRecommendApi(config.storage);

  return {
    config,
    storage: config.storage,
    queue: config.queue,
    cycle,
    recommend,
  };
}

