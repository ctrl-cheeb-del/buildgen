import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const save = mutation({
  args: {
    buildingName: v.string(),
    gridStorageId: v.id("_storage"),
    frontStorageId: v.id("_storage"),
    rightStorageId: v.id("_storage"),
    backStorageId: v.id("_storage"),
    leftStorageId: v.id("_storage"),
  },
  returns: v.object({
    id: v.id("multiViewPreviews"),
    front: v.union(v.string(), v.null()),
    right: v.union(v.string(), v.null()),
    back: v.union(v.string(), v.null()),
    left: v.union(v.string(), v.null()),
    gridUrl: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("multiViewPreviews", {
      ...args,
      createdAt: Date.now(),
    });

    const [front, right, back, left, gridUrl] = await Promise.all([
      ctx.storage.getUrl(args.frontStorageId),
      ctx.storage.getUrl(args.rightStorageId),
      ctx.storage.getUrl(args.backStorageId),
      ctx.storage.getUrl(args.leftStorageId),
      ctx.storage.getUrl(args.gridStorageId),
    ]);

    return { id, front, right, back, left, gridUrl };
  },
});

export const list = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      _id: v.id("multiViewPreviews"),
      _creationTime: v.number(),
      buildingName: v.string(),
      createdAt: v.number(),
      gridUrl: v.union(v.string(), v.null()),
    })
  ),
  handler: async (ctx, args) => {
    const previews = await ctx.db
      .query("multiViewPreviews")
      .withIndex("by_created")
      .order("desc")
      .take(args.limit ?? 20);

    return Promise.all(
      previews.map(async (p) => ({
        _id: p._id,
        _creationTime: p._creationTime,
        buildingName: p.buildingName,
        createdAt: p.createdAt,
        gridUrl: await ctx.storage.getUrl(p.gridStorageId),
      }))
    );
  },
});

export const getUrls = query({
  args: { id: v.id("multiViewPreviews") },
  returns: v.union(
    v.object({
      front: v.union(v.string(), v.null()),
      right: v.union(v.string(), v.null()),
      back: v.union(v.string(), v.null()),
      left: v.union(v.string(), v.null()),
      gridUrl: v.union(v.string(), v.null()),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const preview = await ctx.db.get(args.id);
    if (!preview) return null;

    const [front, right, back, left, gridUrl] = await Promise.all([
      ctx.storage.getUrl(preview.frontStorageId),
      ctx.storage.getUrl(preview.rightStorageId),
      ctx.storage.getUrl(preview.backStorageId),
      ctx.storage.getUrl(preview.leftStorageId),
      ctx.storage.getUrl(preview.gridStorageId),
    ]);

    return { front, right, back, left, gridUrl };
  },
});
