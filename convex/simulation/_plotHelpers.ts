import { v } from "convex/values";
import { internalQuery, internalMutation } from "../_generated/server";

export const getEmpty = internalQuery({
  args: {},
  handler: async (ctx) => {
    const plots = await ctx.db.query("plots").collect();
    return plots.filter((p) => p.status === "empty");
  },
});

export const claimForAgent = internalMutation({
  args: {
    plotIndex: v.number(),
    agentName: v.string(),
  },
  handler: async (ctx, { plotIndex, agentName }) => {
    const plots = await ctx.db
      .query("plots")
      .withIndex("by_index", (q) => q.eq("index", plotIndex))
      .collect();
    const plot = plots[0];
    if (!plot) throw new Error(`Plot ${plotIndex} not found`);

    await ctx.db.patch(plot._id, {
      status: "claimed" as const,
      ownerId: `agent:${agentName}`,
      ownerName: agentName,
      isAgentOwned: true,
    });
  },
});
