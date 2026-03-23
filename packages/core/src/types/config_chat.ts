export type ChatConfig = {
  enabled: boolean;
  endpoint?: string;
  token?: string;
  systemPrompt?: string;
  platformContext?: string | Record<string, unknown>;
  snapshotKey?: string;
  maxSnapshotItems?: number;
  toolPolicy?: "snapshot-first" | "tool-heavy" | "snapshot-only";
  persistence?: {
    threads?: boolean;
    fullTrace?: boolean;
  };
};
