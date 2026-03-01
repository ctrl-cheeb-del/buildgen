import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const updatePlanePosition = mutation({
  args: {
    userId: v.string(),
    x: v.number(),
    y: v.number(),
    z: v.number(),
    heading: v.number(),
    pitch: v.number(),
    roll: v.number(),
    userName: v.string(),
    userAvatar: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("planes")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        x: args.x,
        y: args.y,
        z: args.z,
        heading: args.heading,
        pitch: args.pitch,
        roll: args.roll,
        userName: args.userName,
        userAvatar: args.userAvatar,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("planes", {
        userId: args.userId,
        x: args.x,
        y: args.y,
        z: args.z,
        heading: args.heading,
        pitch: args.pitch,
        roll: args.roll,
        userName: args.userName,
        userAvatar: args.userAvatar,
        updatedAt: Date.now(),
      });
    }
  },
});

export const removePlanePosition = mutation({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("planes")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

export const listActivePlanes = query({
  args: {},
  handler: async (ctx) => {
    const tenSecondsAgo = Date.now() - 10000;
    const allPlanes = await ctx.db.query("planes").collect();
    return allPlanes.filter((p) => p.updatedAt > tenSecondsAgo);
  },
});
