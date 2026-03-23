import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  items: defineTable({
    itemId: v.string(),
    name: v.string(),
    category: v.string(),
    tags: v.optional(v.array(v.string())),
    meta: v.optional(v.object({ region: v.string(), price: v.number(), rating: v.number(), recency: v.number() })),
    active: v.boolean(),
  }).index("by_itemId", ["itemId"]),

  orders: defineTable({
    orderId: v.string(),
    userId: v.string(),
    itemId: v.string(),
    quantity: v.number(),
    unitPrice: v.number(),
    totalPrice: v.number(),
    status: v.string(),
    createdAt: v.number(),
  })
    .index("by_orderId", ["orderId"])
    .index("by_user_created", ["userId", "createdAt"]),
});
