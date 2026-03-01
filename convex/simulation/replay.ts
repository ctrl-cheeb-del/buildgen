import { v } from "convex/values";
import { query, internalQuery } from "../_generated/server";

/** Get all events since a given tick for replay. */
export const getReplaySince = query({
  args: { afterTick: v.number() },
  handler: async (ctx, { afterTick }) => {
    const messages = await ctx.db
      .query("agentMessages")
      .withIndex("by_tick", (q) => q.gte("tickNumber", afterTick))
      .take(500);

    const tickLogs = await ctx.db
      .query("tickLog")
      .withIndex("by_tick", (q) => q.gte("tickNumber", afterTick))
      .take(200);

    const elections = await ctx.db
      .query("elections")
      .withIndex("by_tick", (q) => q.gte("tickNumber", afterTick))
      .take(50);

    // Buildings created during the replay window (for visual timelapse)
    const buildings = await ctx.db
      .query("buildings")
      .withIndex("by_createdAtTick", (q) => q.gte("createdAtTick", afterTick))
      .take(100);

    return { messages, tickLogs, elections, buildings };
  },
});

export const getTickLogsInternal = internalQuery({
  args: { afterTick: v.number(), upToTick: v.number() },
  handler: async (ctx, { afterTick, upToTick }) => {
    const logs = await ctx.db
      .query("tickLog")
      .withIndex("by_tick", (q) => q.gte("tickNumber", afterTick))
      .take(200);
    return logs.filter((l) => l.tickNumber <= upToTick);
  },
});

export const getBuildingsInternal = internalQuery({
  args: { afterTick: v.number(), upToTick: v.number() },
  handler: async (ctx, { afterTick, upToTick }) => {
    const buildings = await ctx.db
      .query("buildings")
      .withIndex("by_createdAtTick", (q) => q.gte("createdAtTick", afterTick))
      .take(100);
    return buildings.filter(
      (b) => b.createdAtTick != null && b.createdAtTick <= upToTick,
    );
  },
});

export const getElectionsInternal = internalQuery({
  args: { afterTick: v.number(), upToTick: v.number() },
  handler: async (ctx, { afterTick, upToTick }) => {
    const elections = await ctx.db
      .query("elections")
      .withIndex("by_tick", (q) => q.gte("tickNumber", afterTick))
      .take(50);
    return elections.filter((e) => e.tickNumber <= upToTick);
  },
});
