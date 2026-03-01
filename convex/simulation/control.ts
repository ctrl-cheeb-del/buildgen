import { v } from "convex/values";
import { action, mutation } from "../_generated/server";
import { internal } from "../_generated/api";

/** Public action: start the simulation (initialize if needed + schedule first tick). */
export const startSimulation = action({
  args: {},
  handler: async (ctx) => {
    await ctx.runAction(internal.simulation.start.run, {});
    return { status: "started" };
  },
});

/** Public mutation: stop the simulation. */
export const stopSimulation = mutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("cityState").collect();
    const state = all[0];
    if (!state) return { status: "no_city" };
    await ctx.db.patch(state._id, { isRunning: false });
    return { status: "stopped" };
  },
});

/** Switch sim mode between "overnight" (5-min ticks) and "live" (45s ticks).
 *  Cancels the pending tick and reschedules at the new interval so the change
 *  takes effect immediately instead of waiting for the old tick to fire. */
export const setSimMode = mutation({
  args: { mode: v.union(v.literal("overnight"), v.literal("live")) },
  handler: async (ctx, { mode }) => {
    const all = await ctx.db.query("cityState").collect();
    const state = all[0];
    if (!state) return { status: "no_city" };

    const oldMode = state.simMode ?? "overnight";
    if (oldMode === mode) {
      return { status: "ok", mode };
    }

    // Cancel the pending city tick scheduled with the old interval
    if (state.nextCityTickId) {
      try {
        await ctx.scheduler.cancel(state.nextCityTickId);
      } catch {
        // Already ran or was cancelled — harmless
      }
    }

    // Schedule a new city tick at the correct interval for the new mode
    const cityTickInterval = mode === "live" ? 10000 : 300000;
    const newCityTickId = await ctx.scheduler.runAfter(
      cityTickInterval,
      internal.simulation.tick.run,
      {},
    );

    await ctx.db.patch(state._id, {
      simMode: mode,
      nextCityTickId: newCityTickId,
    });
    return { status: "ok", mode };
  },
});
