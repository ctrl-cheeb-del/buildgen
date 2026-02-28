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

/** Switch sim mode between "overnight" (5-min ticks) and "live" (45s ticks). */
export const setSimMode = mutation({
  args: { mode: v.union(v.literal("overnight"), v.literal("live")) },
  handler: async (ctx, { mode }) => {
    const all = await ctx.db.query("cityState").collect();
    const state = all[0];
    if (!state) return { status: "no_city" };
    await ctx.db.patch(state._id, { simMode: mode });
    return { status: "ok", mode };
  },
});
