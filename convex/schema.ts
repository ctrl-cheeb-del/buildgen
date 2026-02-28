import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  plots: defineTable({
    index: v.number(),
    col: v.number(),
    row: v.number(),
    status: v.union(
      v.literal("empty"),
      v.literal("claimed"),
      v.literal("generating"),
      v.literal("occupied")
    ),
    ownerId: v.optional(v.string()),
    ownerName: v.optional(v.string()),
    ownerUsername: v.optional(v.string()),
    ownerAvatar: v.optional(v.string()),
    pipelineStep: v.optional(v.string()),
    pipelineMultiViewUrl: v.optional(v.string()),
  })
    .index("by_index", ["index"])
    .index("by_ownerId", ["ownerId"]),

  buildings: defineTable({
    plotIndex: v.number(),
    ownerId: v.string(),
    prompt: v.string(),
    proceduralCode: v.string(),
    multiViewGrid: v.optional(v.string()),
    position: v.optional(
      v.object({ x: v.number(), y: v.number(), z: v.number() })
    ),
    rotation: v.optional(
      v.object({ x: v.number(), y: v.number(), z: v.number() })
    ),
    scale: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_plotIndex", ["plotIndex"]),

  cars: defineTable({
    userId: v.string(),
    x: v.number(),
    z: v.number(),
    heading: v.number(),
    userName: v.string(),
    userAvatar: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  multiViewPreviews: defineTable({
    buildingName: v.string(),
    gridStorageId: v.id("_storage"),
    frontStorageId: v.id("_storage"),
    rightStorageId: v.id("_storage"),
    backStorageId: v.id("_storage"),
    leftStorageId: v.id("_storage"),
    createdAt: v.number(),
  }).index("by_created", ["createdAt"]),
});
