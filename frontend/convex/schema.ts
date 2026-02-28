import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  numbers: defineTable({
    value: v.number(),
  }),

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
