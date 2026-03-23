import { defineApp } from "convex/server";
import veil from "@veil/veil-convex/convex.config.js";

const app = defineApp();
app.use(veil, { name: "veil" });
export default app;
