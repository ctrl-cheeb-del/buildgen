import { v } from "convex/values";
import { query } from "../_generated/server";

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

    return { messages, tickLogs, elections };
  },
});
