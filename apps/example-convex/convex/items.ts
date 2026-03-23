import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";

export const listActive = internalQuery({
  args: {},
  handler: async (ctx) => {
    const docs = await ctx.db.query("items").collect();
    return docs.filter((d) => d.active).map((d) => ({
      id: d.itemId,
      name: d.name,
      category: d.category,
      tags: d.tags ?? undefined,
      meta: d.meta,
      ...(typeof d.meta === "object" && d.meta ? (d.meta as Record<string, unknown>) : {}),
    }));
  },
});

export const seedDemo = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("items").first();
    if (existing) return { seeded: false };

    const now = Date.now();
    const regions = ["BD", "US", "IN", "SG"] as const;

    const foodNames = [
      "Chicken Biryani",
      "Beef Tehari",
      "Vegetable Korma",
      "Paneer Tikka",
      "Mango Lassi",
      "Greek Yogurt",
      "Dark Chocolate Bar",
      "Strawberry Jam",
      "Peanut Butter",
      "Oatmeal Cookies",
      "Spicy Ramen",
      "Tomato Soup",
      "Coconut Water",
      "Green Tea",
    ];

    const groceryNames = [
      "Basmati Rice (5kg)",
      "Lentils (1kg)",
      "Olive Oil (1L)",
      "Sunflower Oil (1L)",
      "Whole Wheat Flour (2kg)",
      "Brown Sugar (1kg)",
      "Sea Salt",
      "Black Pepper",
      "Dish Soap",
      "Laundry Detergent",
      "Paper Towels",
      "Toilet Paper (12 pack)",
      "Shampoo",
      "Toothpaste",
    ];

    const clothingNames = [
      "Cotton T-Shirt",
      "Denim Jeans",
      "Hoodie",
      "Linen Shirt",
      "Summer Dress",
      "Running Shoes",
      "Sneakers",
      "Leather Belt",
      "Socks (5 pack)",
      "Baseball Cap",
      "Winter Jacket",
      "Sports Shorts",
      "Yoga Leggings",
      "Polo Shirt",
    ];

    const miscNames = [
      "Noise-Canceling Headphones",
      "Wireless Mouse",
      "Mechanical Keyboard",
      "Smart Light Bulb",
      "Stainless Steel Water Bottle",
      "Coffee Mug",
      "Notebook",
      "Ballpoint Pen Set",
      "Backpack",
      "Desk Lamp",
      "Cookware Set",
      "Phone Charger",
      "Bluetooth Speaker",
      "Classic Novel Box Set",
    ];

    const tagsPool = ["available", "trending", "sale", "new", "popular", "seasonal"];

    const items: Array<{
      itemId: string;
      name: string;
      category: string;
      tags: string[];
      meta: { region: string; price: number; rating: number; recency: number };
    }> = [];

    const total = 100;
    for (let i = 0; i < total; i++) {
      const bucket = i % 4;
      const region = regions[i % regions.length]!;
      const recency = now - (i * 6 * 60 * 60 * 1000 + (i % 7) * 30 * 60 * 1000); // staggered hours + minutes

      let name = "";
      let category = "";
      let priceMin = 20;
      let priceMax = 200;

      if (bucket === 0) {
        name = foodNames[i % foodNames.length]!;
        category = "food";
        priceMin = 50;
        priceMax = 600;
      } else if (bucket === 1) {
        name = clothingNames[i % clothingNames.length]!;
        category = "clothing";
        priceMin = 200;
        priceMax = 3000;
      } else if (bucket === 2) {
        name = groceryNames[i % groceryNames.length]!;
        category = "grocery";
        priceMin = 30;
        priceMax = 1200;
      } else {
        name = miscNames[i % miscNames.length]!;
        category = ["electronics", "home", "books", "beauty"][i % 4]!;
        priceMin = 150;
        priceMax = 8000;
      }

      const price = priceMin + ((i * 97) % (priceMax - priceMin + 1));
      const rating = Math.round((3.2 + ((i * 13) % 18) / 10) * 10) / 10; // 3.2 .. 5.0

      const tags = [
        "available",
        ...(i % 3 === 0 ? ["popular"] : []),
        ...(i % 5 === 0 ? ["sale"] : []),
        ...(i % 7 === 0 ? ["new"] : []),
        ...(i % 11 === 0 ? ["trending"] : []),
      ].filter((t, idx, arr) => arr.indexOf(t) === idx);

      // ensure at least 1-3 tags, keep within pool
      const finalTags = tags
        .concat([tagsPool[(i * 3) % tagsPool.length]!, tagsPool[(i * 5) % tagsPool.length]!])
        .filter((t, idx, arr) => arr.indexOf(t) === idx)
        .slice(0, 3);

      items.push({
        itemId: `prod_${String(i + 1).padStart(3, "0")}`,
        name,
        category,
        tags: finalTags,
        meta: { region, price, rating, recency },
      });
    }

    for (const item of items) {
      await ctx.db.insert("items", { ...item, active: true });
    }

    return { seeded: true, count: items.length };
  },
});
