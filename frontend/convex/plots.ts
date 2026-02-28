import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

const GRID_COLS = 4;
const GRID_ROWS = 5;

export const getPlots = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("plots").collect();
  },
});

export const initializePlots = mutation({
  args: {},
  handler: async (ctx) => {
    // Check if plots already exist
    const existing = await ctx.db.query("plots").first();
    if (existing) return;

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

export const claimNextEmpty = mutation({
  args: {},
  handler: async (ctx) => {
    const plots = await ctx.db.query("plots").collect();
    const sorted = plots.sort((a, b) => a.index - b.index);
    const empty = sorted.find((p) => p.status === "empty");
    if (!empty) return null;

    await ctx.db.patch(empty._id, { status: "generating" });
    return empty.index;
  },
});

export const markComplete = mutation({
  args: {
    plotIndex: v.number(),
    buildingId: v.id("buildings"),
  },
  handler: async (ctx, { plotIndex, buildingId }) => {
    const plots = await ctx.db
      .query("plots")
      .withIndex("by_index", (q) => q.eq("index", plotIndex))
      .collect();
    const plot = plots[0];
    if (!plot) throw new Error(`Plot ${plotIndex} not found`);

    if (plot.status !== "generating") {
      throw new Error(
        `Plot ${plotIndex} is "${plot.status}", expected "generating"`
      );
    }

    await ctx.db.patch(plot._id, {
      status: "complete",
      buildingId,
    });
  },
});

export const resetPlot = mutation({
  args: { plotIndex: v.number() },
  handler: async (ctx, { plotIndex }) => {
    const plots = await ctx.db
      .query("plots")
      .withIndex("by_index", (q) => q.eq("index", plotIndex))
      .collect();
    const plot = plots[0];
    if (!plot) throw new Error(`Plot ${plotIndex} not found`);

    await ctx.db.patch(plot._id, {
      status: "empty",
      buildingId: undefined,
    });
  },
});
