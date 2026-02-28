import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  plots: defineTable({
    index: v.number(),
    col: v.number(),
    row: v.number(),
    status: v.union(
      v.literal("empty"),
      v.literal("generating"),
      v.literal("complete")
    ),
    buildingId: v.optional(v.id("buildings")),
  }).index("by_index", ["index"]),

  buildings: defineTable({
    plotIndex: v.number(),
    prompt: v.string(),
    proceduralCode: v.string(),
    multiViewGrid: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_plotIndex", ["plotIndex"]),

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
