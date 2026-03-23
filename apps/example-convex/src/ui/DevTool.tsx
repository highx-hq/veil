import { DevToolProvider } from "@veil/devtools";

export const DevTool = () => {
  const convexUrl = import.meta.env.VITE_CONVEX_SITE_URL as string | undefined;
  const apiKey = import.meta.env.VITE_VEIL_DEVTOOLS_API_KEY as string | undefined;

  if (!convexUrl) {
    throw new Error("Missing VITE_CONVEX_URL. Set it in apps/example-convex/.env.local for Vite.");
  }

  return <DevToolProvider apiBaseUrl={convexUrl} apiKey={apiKey} />;
};
