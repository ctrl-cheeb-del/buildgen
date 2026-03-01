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
    isAgentOwned: v.optional(v.boolean()),
    lastSeenTick: v.optional(v.number()),
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
    category: v.optional(
      v.union(
        v.literal("residential"),
        v.literal("commercial"),
        v.literal("industrial"),
        v.literal("office"),
        v.literal("civic"),
        v.literal("entertainment"),
        v.literal("luxury")
      )
    ),
    createdAt: v.number(),
    createdAtTick: v.optional(v.number()),
  })
    .index("by_plotIndex", ["plotIndex"])
    .searchIndex("search_prompt", {
      searchField: "prompt",
      filterFields: ["category"],
    }),

  cars: defineTable({
    userId: v.string(),
    x: v.number(),
    z: v.number(),
    heading: v.number(),
    userName: v.string(),
    userAvatar: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  boats: defineTable({
    userId: v.string(),
    x: v.number(),
    z: v.number(),
    heading: v.number(),
    userName: v.string(),
    userAvatar: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  planes: defineTable({
    userId: v.string(),
    x: v.number(),
    y: v.number(),
    z: v.number(),
    heading: v.number(),
    pitch: v.number(),
    roll: v.number(),
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

  // ── Simulation tables ──────────────────────────────────────────────

  cityState: defineTable({
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
    totalTicks: v.number(),
    lastTickAt: v.number(),
    isRunning: v.boolean(),
    simMode: v.optional(v.union(v.literal("overnight"), v.literal("live"))),
    activeBuildCount: v.number(),
    consecutiveBankruptTicks: v.optional(v.number()),
    activeDecree: v.optional(
      v.object({
        title: v.string(),
        description: v.string(),
        effect: v.string(),
        remainingTicks: v.number(),
      })
    ),
  }),

  agents: defineTable({
    plotIndex: v.number(),
    name: v.string(),
    role: v.union(v.literal("mayor"), v.literal("citizen")),
    personality: v.string(),
    traits: v.array(v.string()),
    wealth: v.number(),
    satisfaction: v.number(),
    loyaltyToMayor: v.number(),
    buildingCategory: v.optional(v.string()),
    lastAction: v.optional(v.string()),
    lastActionTick: v.optional(v.number()),
    memoryBuffer: v.array(v.string()),
    isActive: v.boolean(),
  })
    .index("by_plotIndex", ["plotIndex"])
    .index("by_role", ["role"]),

  agentMessages: defineTable({
    senderPlotIndex: v.number(),
    senderName: v.string(),
    recipientPlotIndex: v.optional(v.number()),
    content: v.string(),
    messageType: v.union(
      v.literal("chat"),
      v.literal("petition"),
      v.literal("protest"),
      v.literal("praise"),
      v.literal("announcement"),
      v.literal("build_request")
    ),
    tickNumber: v.number(),
    createdAt: v.number(),
  })
    .index("by_tick", ["tickNumber"])
    .index("by_senderPlot", ["senderPlotIndex"]),

  tickLog: defineTable({
    tickNumber: v.number(),
    mayorDecision: v.optional(v.string()),
    agentsActed: v.number(),
    metricsSnapshot: v.string(),
    eventFired: v.optional(v.string()),
  }).index("by_tick", ["tickNumber"]),

  elections: defineTable({
    tickNumber: v.number(),
    votes: v.array(
      v.object({
        agentPlot: v.number(),
        vote: v.union(v.literal("keep"), v.literal("replace")),
        reason: v.string(),
      })
    ),
    result: v.union(v.literal("kept"), v.literal("replaced")),
    newMayorPersonality: v.optional(v.string()),
  }).index("by_tick", ["tickNumber"]),
});
