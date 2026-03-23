import { jsonSchema } from "ai";

import type { VeilChatTool } from "@veil/core";

export type ConvexToolDescriptor = {
  name: string;
  description: string;
  inputSchema: any;
  kind: "query" | "mutation" | "action";
  handler: string;
};

export function buildConvexTools(
  ctx: {
    runAction: any;
    runMutation: any;
    runQuery: any;
  },
  tools: ConvexToolDescriptor[],
): VeilChatTool[] {
  return tools.map((toolDef) => ({
    name: toolDef.name,
    description: toolDef.description,
    inputSchema: jsonSchema(toolDef.inputSchema) as any,
    execute: async (_toolCtx, input) => {
      if (toolDef.kind === "query") {
        return await ctx.runQuery(toolDef.handler as any, input as any);
      }
      if (toolDef.kind === "mutation") {
        return await ctx.runMutation(toolDef.handler as any, input as any);
      }
      return await ctx.runAction(toolDef.handler as any, input as any);
    },
  }));
}
