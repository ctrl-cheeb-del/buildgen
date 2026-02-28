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
