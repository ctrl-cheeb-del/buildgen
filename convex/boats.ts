import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const updateBoatPosition = mutation({
  args: {
    userId: v.string(),
    x: v.number(),
    z: v.number(),
    heading: v.number(),
    userName: v.string(),
    userAvatar: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("boats")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        x: args.x,
        z: args.z,
        heading: args.heading,
        userName: args.userName,
        userAvatar: args.userAvatar,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("boats", {
        userId: args.userId,
        x: args.x,
        z: args.z,
        heading: args.heading,
        userName: args.userName,
        userAvatar: args.userAvatar,
        updatedAt: Date.now(),
      });
    }
  },
});

export const removeBoatPosition = mutation({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("boats")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

export const listActiveBoats = query({
  args: {},
  handler: async (ctx) => {
    const tenSecondsAgo = Date.now() - 10000;
    const allBoats = await ctx.db.query("boats").collect();
    return allBoats.filter((b) => b.updatedAt > tenSecondsAgo);
  },
});
