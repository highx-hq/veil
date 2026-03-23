export type QueueMessage = {
  id?: string;
  type: string;
  payload: unknown;
  ts?: number;
};

export type QueueAdapter = {
  enqueue: (message: QueueMessage) => Promise<void>;
  batch: (messages: QueueMessage[]) => Promise<void>;
  info?: {
    kind: string;
  };
};
