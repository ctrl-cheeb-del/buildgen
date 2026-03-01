"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

const STUCK_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

export const run = internalAction({
  args: {},
  handler: async (ctx) => {
    const city = await ctx.runQuery(internal.simulation.cityState.getInternal);

    // No city → initialize + start
    if (!city) {
      console.log("[ensureRunning] No city state, initializing...");
      await ctx.runAction(internal.simulation.initialize.run, {});
      await ctx.runMutation(internal.simulation.cityState.setRunningInternal, {
        isRunning: true,
      });
      await ctx.scheduler.runAfter(1000, internal.simulation.tick.run, {});
      await ctx.scheduler.runAfter(2000, internal.simulation.agentTick.run, {});
      console.log("[ensureRunning] City initialized and started (both tick chains)");
      return;
    }

    // Stopped → restart (only if not recently ticked — avoids duplicate chains)
    if (!city.isRunning) {
      const sinceLast = Date.now() - city.lastTickAt;
      if (sinceLast > 30000) {
        console.log("[ensureRunning] Sim stopped, restarting...");
        await ctx.runMutation(internal.simulation.cityState.setRunningInternal, {
          isRunning: true,
        });
        await ctx.scheduler.runAfter(1000, internal.simulation.tick.run, {});
        await ctx.scheduler.runAfter(2000, internal.simulation.agentTick.run, {});
        console.log("[ensureRunning] Sim restarted (both tick chains)");
      }
      return;
    }

    // Stuck (lastTickAt > 10 min ago and isRunning=true) → likely orphaned tick chain
    const elapsed = Date.now() - city.lastTickAt;
    if (elapsed > STUCK_THRESHOLD_MS) {
      console.log(
        `[ensureRunning] Sim stuck (last tick ${Math.round(elapsed / 1000)}s ago), re-scheduling...`
      );
      // Update lastTickAt to prevent duplicate recovery from next cron
      await ctx.runMutation(internal.simulation.cityState.update, {
        patch: { lastTickAt: Date.now() },
      });
      await ctx.scheduler.runAfter(1000, internal.simulation.tick.run, {});
      await ctx.scheduler.runAfter(2000, internal.simulation.agentTick.run, {});
      return;
    }

    // Healthy → check if agents need expansion
    const agents: any[] = await ctx.runQuery(internal.simulation.agents.getAllInternal);
    if (agents.length < 55) {
      console.log(`[ensureRunning] Only ${agents.length} agents, expanding...`);
      await ctx.runAction(internal.simulation.expandAgents.run, {});
    }
  },
});
