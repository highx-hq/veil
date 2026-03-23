export type UserAffinityMap = Record<string, number>;

export type UserInteractionHistory = {
  views?: Record<string, number>;
  clicks?: Record<string, number>;
  purchases?: Record<string, number>;
  dislikes?: Record<string, number>;
};

export type UserContext = {
  id?: string;
  query?: string;
  queryEmbedding?: number[];
  categoryAffinity?: UserAffinityMap;
  tagAffinity?: UserAffinityMap;
  itemAffinity?: UserAffinityMap;
  history?: UserInteractionHistory;
  traits?: Record<string, string | number | boolean>;
};
