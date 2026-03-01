import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const claimPlotForUser = internalMutation({
  args: {
    plotIndex: v.number(),
    ownerId: v.string(),
    ownerName: v.string(),
    ownerUsername: v.optional(v.string()),
  },
  handler: async (ctx, { plotIndex, ownerId, ownerName, ownerUsername }) => {
    const plots = await ctx.db
      .query("plots")
      .withIndex("by_index", (q) => q.eq("index", plotIndex))
      .collect();
    const plot = plots[0];
    if (!plot) throw new Error(`Plot ${plotIndex} not found`);

    await ctx.db.patch(plot._id, {
      status: "claimed" as const,
      ownerId,
      ownerName,
      ownerUsername,
      isAgentOwned: false,
    });
  },
});

/** One-off fix: patch user plot metadata (username, avatar, etc.) */
export const patchPlotOwner = internalMutation({
  args: {
    plotIndex: v.number(),
    ownerName: v.string(),
    ownerUsername: v.optional(v.string()),
    ownerAvatar: v.optional(v.string()),
  },
  handler: async (ctx, { plotIndex, ownerName, ownerUsername, ownerAvatar }) => {
    const plots = await ctx.db
      .query("plots")
      .withIndex("by_index", (q) => q.eq("index", plotIndex))
      .collect();
    const plot = plots[0];
    if (!plot) return;

    const patch: Record<string, unknown> = { ownerName };
    if (ownerUsername !== undefined) patch.ownerUsername = ownerUsername;
    if (ownerAvatar !== undefined) patch.ownerAvatar = ownerAvatar;
    await ctx.db.patch(plot._id, patch);
  },
});

export const insertBuilding = internalMutation({
  args: {
    plotIndex: v.number(),
    ownerId: v.string(),
    prompt: v.string(),
    proceduralCode: v.string(),
    multiViewGrid: v.optional(v.string()),
    position: v.object({ x: v.number(), y: v.number(), z: v.number() }),
    rotation: v.optional(
      v.object({ x: v.number(), y: v.number(), z: v.number() })
    ),
    scale: v.optional(v.number()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const VALID_CATEGORIES = new Set([
      "residential", "commercial", "industrial", "office",
      "civic", "entertainment", "luxury",
    ]);
    const category = args.category && VALID_CATEGORIES.has(args.category)
      ? (args.category as "residential" | "commercial" | "industrial" | "office" | "civic" | "entertainment" | "luxury")
      : undefined;

    return await ctx.db.insert("buildings", {
      plotIndex: args.plotIndex,
      ownerId: args.ownerId,
      prompt: args.prompt,
      proceduralCode: args.proceduralCode,
      multiViewGrid: args.multiViewGrid,
      position: args.position,
      rotation: args.rotation,
      scale: args.scale,
      category,
      createdAt: Date.now(),
    });
  },
});

export const setPlotOccupied = internalMutation({
  args: { plotIndex: v.number() },
  handler: async (ctx, { plotIndex }) => {
    const plots = await ctx.db
      .query("plots")
      .withIndex("by_index", (q) => q.eq("index", plotIndex))
      .collect();
    const plot = plots[0];
    if (!plot) return;
    await ctx.db.patch(plot._id, { status: "occupied" as const });
  },
});

export const getAgentPlots = internalQuery({
  args: {},
  handler: async (ctx) => {
    const plots = await ctx.db.query("plots").collect();
    return plots
      .filter((p) => p.isAgentOwned && p.ownerId)
      .map((p) => ({ index: p.index, ownerId: p.ownerId! }));
  },
});

export const getEmptyPlots = internalQuery({
  args: {},
  handler: async (ctx) => {
    const plots = await ctx.db.query("plots").collect();
    return plots
      .filter((p) => p.status === "empty")
      .map((p) => ({ index: p.index }));
  },
});

export const claimPlotForAgent = internalMutation({
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
    if (!plot) return;
    const ownerId = `agent:${agentName}`;
    await ctx.db.patch(plot._id, {
      status: "claimed" as const,
      ownerId,
      ownerName: agentName,
      isAgentOwned: true,
    });
  },
});

export const boostConditions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cityStates = await ctx.db.query("cityState").collect();
    const city = cityStates[0];
    if (city) {
      await ctx.db.patch(city._id, {
        treasury: 25000,
        happiness: 65,
        approvalRating: 70,
      });
    }

    const agents = await ctx.db.query("agents").collect();
    for (const agent of agents) {
      await ctx.db.patch(agent._id, {
        wealth: 1500 + Math.floor(Math.random() * 1500),
        satisfaction: 60 + Math.floor(Math.random() * 25),
      });
    }

    console.log(
      `[reseed] Boosted treasury to 25k, ${agents.length} agents boosted`
    );
  },
});
