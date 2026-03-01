import { v } from "convex/values";
import { query, internalQuery, internalMutation } from "./_generated/server";
import { normalizePrompt } from "./lib/normalizePrompt";

/** Look up a cached design by normalized prompt. */
export const getByPrompt = internalQuery({
  args: { prompt: v.string() },
  handler: async (ctx, { prompt }) => {
    const key = normalizePrompt(prompt);
    return await ctx.db
      .query("buildingDesigns")
      .withIndex("by_normalizedPrompt", (q) => q.eq("normalizedPrompt", key))
      .first();
  },
});

/** Insert a new design or update existing one for the same normalized prompt. */
export const upsert = internalMutation({
  args: {
    originalPrompt: v.string(),
    proceduralCode: v.string(),
    multiViewGridUrl: v.optional(v.string()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const key = normalizePrompt(args.originalPrompt);
    const existing = await ctx.db
      .query("buildingDesigns")
      .withIndex("by_normalizedPrompt", (q) => q.eq("normalizedPrompt", key))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        proceduralCode: args.proceduralCode,
        multiViewGridUrl: args.multiViewGridUrl,
      });
      return existing._id;
    }

    return await ctx.db.insert("buildingDesigns", {
      normalizedPrompt: key,
      originalPrompt: args.originalPrompt,
      proceduralCode: args.proceduralCode,
      multiViewGridUrl: args.multiViewGridUrl,
      category: args.category,
      createdAt: Date.now(),
    });
  },
});

/** Update just the procedural code for a cached design (e.g. after iteration). */
export const updateCode = internalMutation({
  args: {
    normalizedPrompt: v.string(),
    proceduralCode: v.string(),
  },
  handler: async (ctx, { normalizedPrompt, proceduralCode }) => {
    const existing = await ctx.db
      .query("buildingDesigns")
      .withIndex("by_normalizedPrompt", (q) =>
        q.eq("normalizedPrompt", normalizedPrompt)
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { proceduralCode });
    }
  },
});

/** List all cached designs (admin/debug). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("buildingDesigns")
      .order("desc")
      .take(100);
  },
});

/** Check if a prompt has a cached design (for UI "cached" badge). */
export const checkCache = query({
  args: { prompt: v.string() },
  handler: async (ctx, { prompt }) => {
    const key = normalizePrompt(prompt);
    const hit = await ctx.db
      .query("buildingDesigns")
      .withIndex("by_normalizedPrompt", (q) => q.eq("normalizedPrompt", key))
      .first();
    return { cached: !!hit };
  },
});
