import { v } from "convex/values";
import { internalMutation, query } from "../_generated/server";

export const create = internalMutation({
  args: {
    tickNumber: v.number(),
    votes: v.array(
      v.object({
        agentPlot: v.number(),
        vote: v.union(v.literal("keep"), v.literal("replace")),
        reason: v.string(),
      })
    ),
    result: v.union(v.literal("kept"), v.literal("replaced")),
    newMayorPersonality: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("elections", args);
  },
});

export const getLatest = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("elections")
      .withIndex("by_tick")
      .order("desc")
      .first();
  },
});
