import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

/** Called when an agent build completes successfully. */
export const onBuildComplete = internalMutation({
  args: {
    plotIndex: v.number(),
    category: v.string(),
    agentName: v.string(),
  },
  handler: async (ctx, { plotIndex, category, agentName }) => {
    // Decrement active build count
    const allCity = await ctx.db.query("cityState").collect();
    const city = allCity[0];
    if (city) {
      await ctx.db.patch(city._id, {
        activeBuildCount: Math.max(0, city.activeBuildCount - 1),
      });
    }

    // Update agent's buildingCategory (comma-separated list of types on their plot)
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_plotIndex", (q) => q.eq("plotIndex", plotIndex))
      .collect();
    const agent = agents[0];
    if (agent) {
      const existing = agent.buildingCategory;
      const updated = existing ? `${existing}, ${category}` : category;
      await ctx.db.patch(agent._id, { buildingCategory: updated });
    }

    // Set category on the building
    const buildings = await ctx.db
      .query("buildings")
      .withIndex("by_plotIndex", (q) => q.eq("plotIndex", plotIndex))
      .order("desc")
      .collect();
    const building = buildings[0];
    if (building) {
      await ctx.db.patch(building._id, { category: category as any });
    }
  },
});

/** Called when an agent build fails. Decrements activeBuildCount. */
export const onBuildFailed = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allCity = await ctx.db.query("cityState").collect();
    const city = allCity[0];
    if (city) {
      await ctx.db.patch(city._id, {
        activeBuildCount: Math.max(0, city.activeBuildCount - 1),
      });
    }
  },
});

/** Forced building liquidation during bankruptcy. Deletes building + resets plot. */
export const liquidateBuilding = internalMutation({
  args: {
    buildingId: v.string(),
    plotIndex: v.number(),
  },
  handler: async (ctx, { buildingId, plotIndex }) => {
    // Delete the building
    const building = await ctx.db.get(buildingId as any);
    if (building) {
      await ctx.db.delete(building._id);
    }

    // Decrement active build count (matches onBuildComplete/onBuildFailed pattern)
    const allCity = await ctx.db.query("cityState").collect();
    const city = allCity[0];
    if (city) {
      await ctx.db.patch(city._id, {
        activeBuildCount: Math.max(0, city.activeBuildCount - 1),
      });
    }

    // Reset plot to "claimed" (agent still owns the empty land)
    const plots = await ctx.db
      .query("plots")
      .withIndex("by_index", (q) => q.eq("index", plotIndex))
      .collect();
    const plot = plots[0];
    if (plot) {
      await ctx.db.patch(plot._id, { status: "claimed" });
    }
  },
});
