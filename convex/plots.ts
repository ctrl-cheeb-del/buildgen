import { v } from "convex/values";
import { query, mutation, internalMutation, internalQuery } from "./_generated/server";

const GRID_COLS = 8;
const GRID_ROWS = 10;

export const getPlots = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("plots").collect();
  },
});

export const initializePlots = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("plots").collect();

    // Re-init if grid size changed
    if (existing.length > 0 && existing.length !== GRID_COLS * GRID_ROWS) {
      for (const plot of existing) {
        await ctx.db.delete(plot._id);
      }
    } else if (existing.length > 0) {
      return;
    }

    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const index = row * GRID_COLS + col;
        await ctx.db.insert("plots", {
          index,
          col,
          row,
          status: "empty",
        });
      }
    }
  },
});

export const claimPlot = mutation({
  args: { plotIndex: v.number() },
  handler: async (ctx, { plotIndex }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");

    const userId = identity.subject;

    // Check if user already owns a plot
    const ownedPlots = await ctx.db
      .query("plots")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", userId))
      .collect();
    if (ownedPlots.length > 0) {
      throw new Error("You already own a plot");
    }

    // Check target plot is empty
    const plots = await ctx.db
      .query("plots")
      .withIndex("by_index", (q) => q.eq("index", plotIndex))
      .collect();
    const plot = plots[0];
    if (!plot) throw new Error(`Plot ${plotIndex} not found`);
    if (plot.status !== "empty") {
      throw new Error(`Plot ${plotIndex} is not available`);
    }

    await ctx.db.patch(plot._id, {
      status: "claimed",
      ownerId: userId,
      ownerName: identity.name ?? identity.nickname ?? "Unknown",
      ownerUsername: identity.nickname ?? undefined,
      ownerAvatar: identity.pictureUrl,
    });

    return plotIndex;
  },
});

export const releasePlot = mutation({
  args: { plotIndex: v.number() },
  handler: async (ctx, { plotIndex }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");

    const plots = await ctx.db
      .query("plots")
      .withIndex("by_index", (q) => q.eq("index", plotIndex))
      .collect();
    const plot = plots[0];
    if (!plot) throw new Error(`Plot ${plotIndex} not found`);
    if (plot.ownerId !== identity.subject) {
      throw new Error("You don't own this plot");
    }

    // Delete all buildings on this plot
    const buildings = await ctx.db
      .query("buildings")
      .withIndex("by_plotIndex", (q) => q.eq("plotIndex", plotIndex))
      .collect();
    for (const b of buildings) {
      await ctx.db.delete(b._id);
    }

    await ctx.db.patch(plot._id, {
      status: "empty",
      ownerId: undefined,
      ownerName: undefined,
      ownerUsername: undefined,
      ownerAvatar: undefined,
    });
  },
});

export const getMyPlot = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const plots = await ctx.db
      .query("plots")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", identity.subject))
      .collect();
    return plots[0] ?? null;
  },
});

// Keep for backward compat during pipeline — sets plot to generating
export const markGenerating = mutation({
  args: { plotIndex: v.number() },
  handler: async (ctx, { plotIndex }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");

    const plots = await ctx.db
      .query("plots")
      .withIndex("by_index", (q) => q.eq("index", plotIndex))
      .collect();
    const plot = plots[0];
    if (!plot) throw new Error(`Plot ${plotIndex} not found`);
    if (plot.ownerId !== identity.subject) {
      throw new Error("You don't own this plot");
    }

    await ctx.db.patch(plot._id, {
      status: "generating",
      pipelineStep: undefined,
      pipelineMultiViewUrl: undefined,
    });
  },
});

export const markOccupied = mutation({
  args: { plotIndex: v.number() },
  handler: async (ctx, { plotIndex }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");

    const plots = await ctx.db
      .query("plots")
      .withIndex("by_index", (q) => q.eq("index", plotIndex))
      .collect();
    const plot = plots[0];
    if (!plot) throw new Error(`Plot ${plotIndex} not found`);
    if (plot.ownerId !== identity.subject) {
      throw new Error("You don't own this plot");
    }

    await ctx.db.patch(plot._id, { status: "occupied" });
  },
});

export const resetPlot = mutation({
  args: { plotIndex: v.number() },
  handler: async (ctx, { plotIndex }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");

    const plots = await ctx.db
      .query("plots")
      .withIndex("by_index", (q) => q.eq("index", plotIndex))
      .collect();
    const plot = plots[0];
    if (!plot) throw new Error(`Plot ${plotIndex} not found`);
    if (plot.ownerId !== identity.subject) {
      throw new Error("You don't own this plot");
    }

    // Reset to claimed (user still owns it, just no buildings generating)
    await ctx.db.patch(plot._id, { status: "claimed" });
  },
});

export const updateLastSeenTick = mutation({
  args: { tick: v.number() },
  handler: async (ctx, { tick }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return;

    const plots = await ctx.db
      .query("plots")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", identity.subject))
      .collect();
    const plot = plots[0];
    if (!plot) return;

    await ctx.db.patch(plot._id, { lastSeenTick: tick });
  },
});

// --- Internal mutations (callable from Convex actions, skip auth checks) ---

export const setPipelineStepInternal = internalMutation({
  args: {
    plotIndex: v.number(),
    step: v.optional(v.string()),
    multiViewUrl: v.optional(v.string()),
  },
  handler: async (ctx, { plotIndex, step, multiViewUrl }) => {
    const plots = await ctx.db
      .query("plots")
      .withIndex("by_index", (q) => q.eq("index", plotIndex))
      .collect();
    const plot = plots[0];
    if (!plot) throw new Error(`Plot ${plotIndex} not found`);
    const patch: Record<string, unknown> = {};
    if (step !== undefined) patch.pipelineStep = step;
    if (multiViewUrl !== undefined) patch.pipelineMultiViewUrl = multiViewUrl;
    await ctx.db.patch(plot._id, patch);
  },
});

export const markGeneratingInternal = internalMutation({
  args: { plotIndex: v.number() },
  handler: async (ctx, { plotIndex }) => {
    const plots = await ctx.db
      .query("plots")
      .withIndex("by_index", (q) => q.eq("index", plotIndex))
      .collect();
    const plot = plots[0];
    if (!plot) throw new Error(`Plot ${plotIndex} not found`);
    await ctx.db.patch(plot._id, {
      status: "generating",
      pipelineStep: undefined,
      pipelineMultiViewUrl: undefined,
    });
  },
});

export const markOccupiedInternal = internalMutation({
  args: { plotIndex: v.number() },
  handler: async (ctx, { plotIndex }) => {
    const plots = await ctx.db
      .query("plots")
      .withIndex("by_index", (q) => q.eq("index", plotIndex))
      .collect();
    const plot = plots[0];
    if (!plot) throw new Error(`Plot ${plotIndex} not found`);
    await ctx.db.patch(plot._id, {
      status: "occupied",
      pipelineStep: undefined,
      // Keep pipelineMultiViewUrl — iteration loop needs it after generation
    });
  },
});

export const resetPlotInternal = internalMutation({
  args: { plotIndex: v.number() },
  handler: async (ctx, { plotIndex }) => {
    const plots = await ctx.db
      .query("plots")
      .withIndex("by_index", (q) => q.eq("index", plotIndex))
      .collect();
    const plot = plots[0];
    if (!plot) throw new Error(`Plot ${plotIndex} not found`);
    await ctx.db.patch(plot._id, {
      status: "claimed",
      pipelineStep: undefined,
      pipelineMultiViewUrl: undefined,
    });
  },
});

/** Count plots currently in "generating" status (ground-truth active build count). */
export const countGenerating = internalQuery({
  args: {},
  handler: async (ctx) => {
    const plots = await ctx.db.query("plots").collect();
    return plots.filter((p) => p.status === "generating").length;
  },
});
