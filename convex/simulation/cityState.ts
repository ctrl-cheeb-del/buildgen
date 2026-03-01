import { v } from "convex/values";
import { query, internalQuery, mutation, internalMutation } from "../_generated/server";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("cityState").collect();
    return all[0] ?? null;
  },
});

export const getInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("cityState").collect();
    return all[0] ?? null;
  },
});

export const create = internalMutation({
  args: {
    treasury: v.number(),
    happiness: v.number(),
    approvalRating: v.number(),
    population: v.number(),
    crimeRate: v.number(),
    pollutionLevel: v.number(),
    educationLevel: v.number(),
    healthLevel: v.number(),
    taxRates: v.object({
      residential: v.number(),
      commercial: v.number(),
      industrial: v.number(),
      luxury: v.number(),
    }),
    budgetAllocation: v.object({
      education: v.number(),
      healthcare: v.number(),
      security: v.number(),
      infrastructure: v.number(),
    }),
    currentMayorId: v.optional(v.id("agents")),
    mayorTerm: v.number(),
    tradeStats: v.optional(
      v.object({
        totalShipsDocked: v.number(),
        totalTradeIncome: v.number(),
        lastShipTick: v.number(),
        portLevel: v.number(),
        tradeMultiplier: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("cityState", {
      ...args,
      totalTicks: 0,
      lastTickAt: Date.now(),
      isRunning: false,
      simMode: "overnight",
      activeBuildCount: 0,
    });
  },
});

export const update = internalMutation({
  args: {
    patch: v.any(),
  },
  handler: async (ctx, { patch }) => {
    const all = await ctx.db.query("cityState").collect();
    const state = all[0];
    if (!state) throw new Error("cityState not found");
    await ctx.db.patch(state._id, patch);
  },
});

export const setRunning = mutation({
  args: { isRunning: v.boolean() },
  handler: async (ctx, { isRunning }) => {
    const all = await ctx.db.query("cityState").collect();
    const state = all[0];
    if (!state) throw new Error("cityState not found");
    await ctx.db.patch(state._id, { isRunning });
  },
});

export const setRunningInternal = internalMutation({
  args: { isRunning: v.boolean() },
  handler: async (ctx, { isRunning }) => {
    const all = await ctx.db.query("cityState").collect();
    const state = all[0];
    if (!state) throw new Error("cityState not found");
    await ctx.db.patch(state._id, { isRunning });
  },
});
