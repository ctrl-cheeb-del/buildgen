import { v } from "convex/values";
import { query, internalQuery, internalMutation } from "../_generated/server";

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("agents").collect();
  },
});

export const getByPlot = query({
  args: { plotIndex: v.number() },
  handler: async (ctx, { plotIndex }) => {
    return await ctx.db
      .query("agents")
      .withIndex("by_plotIndex", (q) => q.eq("plotIndex", plotIndex))
      .first();
  },
});

export const getMayor = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("agents")
      .withIndex("by_role", (q) => q.eq("role", "mayor"))
      .first();
  },
});

export const create = internalMutation({
  args: {
    plotIndex: v.number(),
    name: v.string(),
    role: v.union(v.literal("mayor"), v.literal("citizen")),
    personality: v.string(),
    traits: v.array(v.string()),
    wealth: v.number(),
    satisfaction: v.number(),
    loyaltyToMayor: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("agents", {
      ...args,
      memoryBuffer: [],
      isActive: true,
    });
  },
});

export const update = internalMutation({
  args: {
    agentId: v.id("agents"),
    patch: v.any(),
  },
  handler: async (ctx, { agentId, patch }) => {
    await ctx.db.patch(agentId, patch);
  },
});

export const getAllInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("agents").collect();
  },
});
