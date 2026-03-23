import React, { useMemo } from "react";

import type { DevtoolsClientOptions } from "../runtime/devtoolsClient.js";
import { DevtoolsClientProvider } from "../runtime/DevtoolsClientContext.js";
import VeilToolReact from "../react-tool.js";

export type DevToolProviderProps = {
  apiBaseUrl?: string;
  apiKey?: string;
  title?: string;
  version?: string;
  pollIntervalMs?: number;
};

export function DevToolProvider(props: DevToolProviderProps) {
  const clientOptions: DevtoolsClientOptions = useMemo(
    () => ({
      apiBaseUrl: props.apiBaseUrl ?? "",
      apiKey: props.apiKey,
      pollIntervalMs: props.pollIntervalMs ?? 2000,
    }),
    [props.apiBaseUrl, props.apiKey, props.pollIntervalMs],
  );

  return (
    <DevtoolsClientProvider options={clientOptions}>
      <VeilToolReact
        title={props.title ?? "Veil DevTools"}
        version={props.version ?? "v0.1.0"}
      />
    </DevtoolsClientProvider>
  );
}
