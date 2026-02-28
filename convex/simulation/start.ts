"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

export const run = internalAction({
  args: {},
  handler: async (ctx) => {
    // Check if city state exists; if not, initialize
    const city = await ctx.runQuery(internal.simulation.cityState.getInternal);
    if (!city) {
      console.log("[start] No city state, initializing...");
      await ctx.runAction(internal.simulation.initialize.run, {});
    }

    // Set running
    await ctx.runMutation(internal.simulation.cityState.setRunningInternal, {
      isRunning: true,
    });

    // Schedule first tick
    await ctx.scheduler.runAfter(1000, internal.simulation.tick.run, {});
    console.log("[start] Simulation started, first tick in 1s");
    return { status: "started" };
  },
});
