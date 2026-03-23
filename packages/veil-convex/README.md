# @veil/veil-convex

Veil packaged as a Convex Component.

Component source lives in `convex/` in this package.

## Install (in a Convex app)

1) Add the dependency and run `bun install`.
2) In `convex/convex.config.ts`, install the component:

```ts
import { defineApp } from "convex/server";
import veil from "@veil/veil-convex/convex.config.js";

const app = defineApp();
export const veilComponent = app.use(veil, { name: "veil" });
export default app;
```

Then run `bunx convex dev` (or `bunx convex codegen`) to generate `components`.

## API surface

- `components.veil.cycle.run({ items, geminiApiKey, config, userId?, feedbackLimit? })` (action)
- `components.veil.recommend.get({ limit, offset, filter })` (query)
- `components.veil.chat.respond({ messages, geminiApiKey, model })` (action)
- `components.veil.queue.enqueue({ message, delayMs? })` (mutation; backed by `ctx.scheduler`)
- `components.veil.feedback.record({ userId, itemId, event, score?, meta? })` (mutation)
- `components.veil.feedback.recent({ userId?, limit? })` (query)
