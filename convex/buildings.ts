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
    const identity = await ctx.auth.getUserIdentity();
    const ownerId = identity?.subject ?? "anonymous";
    return await ctx.db.insert("buildings", {
      plotIndex: args.plotIndex,
      ownerId,
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

export const deleteBuilding = mutation({
  args: { buildingId: v.id("buildings") },
  handler: async (ctx, { buildingId }) => {
    await ctx.db.delete(buildingId);
  },
});

/** Delete all buildings and reset all plots to empty. Preserves multiViewPreviews cache. */
export const deleteAll = mutation({
  args: {},
  handler: async (ctx) => {
    const buildings = await ctx.db.query("buildings").collect();
    for (const b of buildings) {
      await ctx.db.delete(b._id);
    }
    const plots = await ctx.db.query("plots").collect();
    for (const p of plots) {
      await ctx.db.patch(p._id, { status: "empty" });
    }
    return { deleted: buildings.length, plotsReset: plots.length };
  },
});

export const updateTransform = mutation({
  args: {
    buildingId: v.id("buildings"),
    position: v.optional(v.object({ x: v.number(), y: v.number(), z: v.number() })),
    rotation: v.optional(v.object({ x: v.number(), y: v.number(), z: v.number() })),
    scale: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {};
    if (args.position !== undefined) patch.position = args.position;
    if (args.rotation !== undefined) patch.rotation = args.rotation;
    if (args.scale !== undefined) patch.scale = args.scale;
    await ctx.db.patch(args.buildingId, patch);
  },
});

export const updateProceduralCode = mutation({
  args: {
    buildingId: v.id("buildings"),
    proceduralCode: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.buildingId, {
      proceduralCode: args.proceduralCode,
    });
  },
});
