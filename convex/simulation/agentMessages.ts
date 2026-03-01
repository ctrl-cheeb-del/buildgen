import { v } from "convex/values";
import { query, internalQuery, internalMutation } from "../_generated/server";

export const getRecent = query({
  args: { afterTick: v.number() },
  handler: async (ctx, { afterTick }) => {
    return await ctx.db
      .query("agentMessages")
      .withIndex("by_tick", (q) => q.gte("tickNumber", afterTick))
      .collect();
  },
});

export const getByAgent = query({
  args: { plotIndex: v.number(), limit: v.optional(v.number()) },
  handler: async (ctx, { plotIndex, limit }) => {
    const msgs = await ctx.db
      .query("agentMessages")
      .withIndex("by_senderPlot", (q) => q.eq("senderPlotIndex", plotIndex))
      .order("desc")
      .collect();
    return limit ? msgs.slice(0, limit) : msgs;
  },
});

export const getRange = internalQuery({
  args: { afterTick: v.number(), upToTick: v.number() },
  handler: async (ctx, { afterTick, upToTick }) => {
    const msgs = await ctx.db
      .query("agentMessages")
      .withIndex("by_tick", (q) => q.gte("tickNumber", afterTick))
      .take(500);
    return msgs.filter((m) => m.tickNumber <= upToTick);
  },
});

export const create = internalMutation({
  args: {
    senderPlotIndex: v.number(),
    senderName: v.string(),
    recipientPlotIndex: v.optional(v.number()),
    content: v.string(),
    messageType: v.union(
      v.literal("chat"),
      v.literal("petition"),
      v.literal("protest"),
      v.literal("praise"),
      v.literal("announcement"),
      v.literal("build_request")
    ),
    tickNumber: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("agentMessages", {
      ...args,
      createdAt: Date.now(),
    });
  },
});
