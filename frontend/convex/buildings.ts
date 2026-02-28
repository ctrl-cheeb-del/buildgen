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
    if (!identity) throw new Error("Authentication required");

    // Verify user owns the target plot
    const matchingPlots = await ctx.db
      .query("plots")
      .withIndex("by_index", (q) => q.eq("index", args.plotIndex))
      .collect();
    const plot = matchingPlots[0];
    if (!plot) throw new Error(`Plot ${args.plotIndex} not found`);
    if (plot.ownerId !== identity.subject) {
      throw new Error("You don't own this plot");
    }

    // Stagger initial position based on existing building count on the plot
    const existingBuildings = await ctx.db
      .query("buildings")
      .withIndex("by_plotIndex", (q) => q.eq("plotIndex", args.plotIndex))
      .collect();
    const count = existingBuildings.length;
    const staggerGrid: [number, number][] = [
      [-20, -20],
      [20, -20],
      [-20, 20],
      [20, 20],
    ];
    let initX = 0;
    let initZ = 0;
    if (count < staggerGrid.length) {
      [initX, initZ] = staggerGrid[count];
    } else if (count >= staggerGrid.length) {
      // Random offset for 5+ buildings
      initX = Math.round((Math.random() - 0.5) * 40);
      initZ = Math.round((Math.random() - 0.5) * 40);
    }

    const buildingId = await ctx.db.insert("buildings", {
      plotIndex: args.plotIndex,
      ownerId: identity.subject,
      prompt: args.prompt,
      proceduralCode: args.proceduralCode,
      multiViewGrid: args.multiViewGrid,
      position: { x: initX, y: 0, z: initZ },
      rotation: { x: 0, y: 0, z: 0 },
      scale: 0.5,
      createdAt: Date.now(),
    });

    // Update plot to occupied if it was claimed or generating
    if (plot.status === "claimed" || plot.status === "generating") {
      await ctx.db.patch(plot._id, { status: "occupied" });
    }

    return buildingId;
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

export const getBuildingsForPlot = query({
  args: { plotIndex: v.number() },
  handler: async (ctx, { plotIndex }) => {
    return await ctx.db
      .query("buildings")
      .withIndex("by_plotIndex", (q) => q.eq("plotIndex", plotIndex))
      .collect();
  },
});

export const deleteBuilding = mutation({
  args: { buildingId: v.id("buildings") },
  handler: async (ctx, { buildingId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");

    const building = await ctx.db.get(buildingId);
    if (!building) throw new Error("Building not found");
    if (building.ownerId !== identity.subject) {
      throw new Error("You don't own this building");
    }

    await ctx.db.delete(buildingId);

    // Check if plot still has buildings; if not, set back to claimed
    const remaining = await ctx.db
      .query("buildings")
      .withIndex("by_plotIndex", (q) => q.eq("plotIndex", building.plotIndex))
      .collect();
    if (remaining.length === 0) {
      const plots = await ctx.db
        .query("plots")
        .withIndex("by_index", (q) => q.eq("index", building.plotIndex))
        .collect();
      const plot = plots[0];
      if (plot && plot.ownerId === identity.subject) {
        await ctx.db.patch(plot._id, { status: "claimed" });
      }
    }
  },
});

export const updateTransform = mutation({
  args: {
    buildingId: v.id("buildings"),
    position: v.optional(
      v.object({ x: v.number(), y: v.number(), z: v.number() })
    ),
    rotation: v.optional(
      v.object({ x: v.number(), y: v.number(), z: v.number() })
    ),
    scale: v.optional(v.number()),
  },
  handler: async (ctx, { buildingId, position, rotation, scale }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");

    const building = await ctx.db.get(buildingId);
    if (!building) throw new Error("Building not found");
    if (building.ownerId !== identity.subject) {
      throw new Error("You don't own this building");
    }

    const updates: Record<string, unknown> = {};

    if (position) {
      // Clamp position to grass area (absolute server-side limit)
      const GRASS_HALF = 54;
      updates.position = {
        x: Math.max(-GRASS_HALF, Math.min(GRASS_HALF, position.x)),
        y: position.y,
        z: Math.max(-GRASS_HALF, Math.min(GRASS_HALF, position.z)),
      };
    }
    if (rotation) {
      updates.rotation = rotation;
    }
    if (scale !== undefined) {
      updates.scale = scale;
    }

    await ctx.db.patch(buildingId, updates);
  },
});
