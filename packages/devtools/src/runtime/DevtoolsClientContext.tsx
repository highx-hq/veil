import React, { createContext, useContext, useMemo } from "react";

import type { DevtoolsClientOptions } from "./devtoolsClient.js";
import { DevtoolsClient } from "./devtoolsClient.js";

const Ctx = createContext<DevtoolsClient | null>(null);

export function DevtoolsClientProvider(props: { options: DevtoolsClientOptions; children: React.ReactNode }) {
  const client = useMemo(() => new DevtoolsClient(props.options), [props.options]);
  return <Ctx.Provider value={client}>{props.children}</Ctx.Provider>;
}

export function useDevtoolsClient(): DevtoolsClient {
  const client = useContext(Ctx);
  if (!client) throw new Error("DevtoolsClientProvider missing");
  return client;
}
