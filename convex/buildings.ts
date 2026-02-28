import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";

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

    // Find a free position on the plot using candidate grid
    const CANDIDATES: [number, number][] = [
      [0, 0],
      [-27, -27],
      [27, -27],
      [-27, 27],
      [27, 27],
    ];
    const MIN_SPACING = 30;

    const existing = await ctx.db
      .query("buildings")
      .withIndex("by_plotIndex", (q) => q.eq("plotIndex", args.plotIndex))
      .collect();

    const occupied = existing.map((b) => ({
      x: b.position?.x ?? 0,
      z: b.position?.z ?? 0,
    }));

    let freeX = 0;
    let freeZ = 0;
    for (const [cx, cz] of CANDIDATES) {
      const overlaps = occupied.some(
        (o) => Math.abs(o.x - cx) < MIN_SPACING && Math.abs(o.z - cz) < MIN_SPACING
      );
      if (!overlaps) {
        freeX = cx;
        freeZ = cz;
        break;
      }
    }

    return await ctx.db.insert("buildings", {
      plotIndex: args.plotIndex,
      ownerId,
      prompt: args.prompt,
      proceduralCode: args.proceduralCode,
      multiViewGrid: args.multiViewGrid,
      position: { x: freeX, y: 0, z: freeZ },
      createdAt: Date.now(),
    });
  },
});

export const createBuildingInternal = internalMutation({
  args: {
    plotIndex: v.number(),
    ownerId: v.string(),
    prompt: v.string(),
    proceduralCode: v.string(),
    multiViewGrid: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Same auto-placement logic as createBuilding
    const CANDIDATES: [number, number][] = [
      [0, 0],
      [-27, -27],
      [27, -27],
      [-27, 27],
      [27, 27],
    ];
    const MIN_SPACING = 30;

    const existing = await ctx.db
      .query("buildings")
      .withIndex("by_plotIndex", (q) => q.eq("plotIndex", args.plotIndex))
      .collect();

    const occupied = existing.map((b) => ({
      x: b.position?.x ?? 0,
      z: b.position?.z ?? 0,
    }));

    let freeX = 0;
    let freeZ = 0;
    for (const [cx, cz] of CANDIDATES) {
      const overlaps = occupied.some(
        (o) => Math.abs(o.x - cx) < MIN_SPACING && Math.abs(o.z - cz) < MIN_SPACING
      );
      if (!overlaps) {
        freeX = cx;
        freeZ = cz;
        break;
      }
    }

    return await ctx.db.insert("buildings", {
      plotIndex: args.plotIndex,
      ownerId: args.ownerId,
      prompt: args.prompt,
      proceduralCode: args.proceduralCode,
      multiViewGrid: args.multiViewGrid,
      position: { x: freeX, y: 0, z: freeZ },
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
