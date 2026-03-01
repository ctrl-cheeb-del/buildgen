import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/** Batch-write all NPC car positions as a single snapshot document. */
export const updateSnapshot = mutation({
  args: {
    cars: v.array(
      v.object({
        index: v.number(),
        x: v.number(),
        z: v.number(),
        heading: v.number(),
        speed: v.number(),
        colorIndex: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("npcCarSnapshot").first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        cars: args.cars,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("npcCarSnapshot", {
        cars: args.cars,
        updatedAt: Date.now(),
      });
    }
  },
});

/** Read the latest NPC car snapshot. */
export const getSnapshot = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("npcCarSnapshot").first();
  },
});
