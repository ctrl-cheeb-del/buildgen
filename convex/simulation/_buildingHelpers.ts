import { v } from "convex/values";
import { internalQuery } from "../_generated/server";

export const countOnPlot = internalQuery({
  args: { plotIndex: v.number() },
  handler: async (ctx, { plotIndex }) => {
    const buildings = await ctx.db
      .query("buildings")
      .withIndex("by_plotIndex", (q) => q.eq("plotIndex", plotIndex))
      .collect();
    return buildings.length;
  },
});

export const getAllWithCategory = internalQuery({
  args: {},
  handler: async (ctx) => {
    const buildings = await ctx.db.query("buildings").collect();
    return buildings.map((b) => ({
      _id: b._id as string,
      plotIndex: b.plotIndex,
      prompt: b.prompt,
      category: b.category,
      ownerId: b.ownerId,
    }));
  },
});
