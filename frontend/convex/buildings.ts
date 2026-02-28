import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const createBuilding = mutation({
  args: {
    plotIndex: v.number(),
    prompt: v.string(),
    proceduralCode: v.string(),
    multiViewGrid: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("buildings", {
      plotIndex: args.plotIndex,
      prompt: args.prompt,
      proceduralCode: args.proceduralCode,
      multiViewGrid: args.multiViewGrid,
      createdAt: Date.now(),
    });
  },
});

export const getBuilding = query({
  args: { buildingId: v.id("buildings") },
  handler: async (ctx, { buildingId }) => {
    return await ctx.db.get(buildingId);
  },
});

export const getAllBuildings = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("buildings").collect();
  },
});
