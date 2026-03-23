import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";

import { App } from "./ui/App";
import "./ui/styles.css";
import { DevTool } from "./ui/DevTool";

const convexUrl = import.meta.env.VITE_CONVEX_SITE_URL as string | undefined;
if (!convexUrl) {
  throw new Error("Missing CONVEX_SITE_URL. Set it in apps/example-convex/.env.local for Vite.");
}

const client = new ConvexReactClient(convexUrl);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConvexProvider client={client}>
      <DevTool />
    </ConvexProvider>
  </React.StrictMode>,
);

