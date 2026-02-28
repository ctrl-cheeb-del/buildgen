import { v } from "convex/values";
import { internalMutation, query } from "../_generated/server";

export const create = internalMutation({
  args: {
    tickNumber: v.number(),
    mayorDecision: v.optional(v.string()),
    agentsActed: v.number(),
    metricsSnapshot: v.string(),
    eventFired: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("tickLog", args);
  },
});

export const getRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const logs = await ctx.db
      .query("tickLog")
      .withIndex("by_tick")
      .order("desc")
      .collect();
    return limit ? logs.slice(0, limit) : logs;
  },
});
