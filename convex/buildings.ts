import { v } from "convex/values";
import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import type { DatabaseReader } from "./_generated/server";

// ── Shared placement helper ──────────────────────────────────────────

const GRID_SPACING = 36;
const MIN_SPACING = 36; // match grid spacing to prevent overlaps
const CANDIDATES: [number, number][] = [
  [-GRID_SPACING, -GRID_SPACING], [0, -GRID_SPACING], [GRID_SPACING, -GRID_SPACING],
  [-GRID_SPACING,  0],                                 [GRID_SPACING,  0],
  [-GRID_SPACING,  GRID_SPACING], [0,  GRID_SPACING], [GRID_SPACING,  GRID_SPACING],
  [0, 0], // center (last resort)
];

async function findFreePosition(
  db: DatabaseReader,
  plotIndex: number,
): Promise<{ x: number; z: number } | null> {
  const existing = await db
    .query("buildings")
    .withIndex("by_plotIndex", (q) => q.eq("plotIndex", plotIndex))
    .collect();

  const occupied = existing.map((b) => ({
    x: b.position?.x ?? 0,
    z: b.position?.z ?? 0,
  }));

  for (const [cx, cz] of CANDIDATES) {
    const overlaps = occupied.some(
      (o) => Math.abs(o.x - cx) < MIN_SPACING && Math.abs(o.z - cz) < MIN_SPACING
    );
    if (!overlaps) {
      return { x: cx, z: cz };
    }
  }

  // All slots full
  return null;
}

export const createBuilding = mutation({
  args: {
    plotIndex: v.number(),
    prompt: v.string(),
    proceduralCode: v.string(),
    multiViewGrid: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const ownerId = identity?.subject ?? "anonymous";

    const pos = await findFreePosition(ctx.db, args.plotIndex);
    if (!pos) {
      throw new Error(`Plot ${args.plotIndex} is full — no free building slots`);
    }

    return await ctx.db.insert("buildings", {
      plotIndex: args.plotIndex,
      ownerId,
      prompt: args.prompt,
      proceduralCode: args.proceduralCode,
      multiViewGrid: args.multiViewGrid,
      position: { x: pos.x, y: 0, z: pos.z },
      createdAt: Date.now(),
    });
  },
});

export const createBuildingInternal = internalMutation({
  args: {
    plotIndex: v.number(),
    ownerId: v.string(),
    prompt: v.string(),
    proceduralCode: v.string(),
    multiViewGrid: v.optional(v.string()),
    createdAtTick: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const pos = await findFreePosition(ctx.db, args.plotIndex);
    if (!pos) {
      console.warn(`[createBuildingInternal] Plot ${args.plotIndex} is full, skipping`);
      return null;
    }

    return await ctx.db.insert("buildings", {
      plotIndex: args.plotIndex,
      ownerId: args.ownerId,
      prompt: args.prompt,
      proceduralCode: args.proceduralCode,
      multiViewGrid: args.multiViewGrid,
      position: { x: pos.x, y: 0, z: pos.z },
      createdAt: Date.now(),
      createdAtTick: args.createdAtTick,
    });
  },
});

export const searchSimilarBuildings = internalQuery({
  args: {
    searchTerm: v.string(),
    category: v.optional(v.string()),
  },
  handler: async (ctx, { searchTerm, category }) => {
    const q = ctx.db
      .query("buildings")
      .withSearchIndex("search_prompt", (search) => {
        const s = search.search("prompt", searchTerm);
        if (category) {
          return s.eq("category", category as any);
        }
        return s;
      });

    const results = await q.take(1);
    if (results.length === 0) return null;

    const match = results[0];
    return {
      prompt: match.prompt,
      proceduralCode: match.proceduralCode,
    };
  },
});

export const getBuilding = query({
  args: { buildingId: v.id("buildings") },
  handler: async (ctx, { buildingId }) => {
    return await ctx.db.get(buildingId);
  },
});

export const getAllBuildings = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("buildings").collect();
  },
});

export const deleteBuilding = mutation({
  args: { buildingId: v.id("buildings") },
  handler: async (ctx, { buildingId }) => {
    await ctx.db.delete(buildingId);
  },
});

/** Delete all buildings and reset all plots to empty. Preserves multiViewPreviews cache. */
export const deleteAll = mutation({
  args: {},
  handler: async (ctx) => {
    const buildings = await ctx.db.query("buildings").collect();
    for (const b of buildings) {
      await ctx.db.delete(b._id);
    }
    const plots = await ctx.db.query("plots").collect();
    for (const p of plots) {
      await ctx.db.patch(p._id, { status: "empty" });
    }
    return { deleted: buildings.length, plotsReset: plots.length };
  },
});

export const updateTransform = mutation({
  args: {
    buildingId: v.id("buildings"),
    position: v.optional(v.object({ x: v.number(), y: v.number(), z: v.number() })),
    rotation: v.optional(v.object({ x: v.number(), y: v.number(), z: v.number() })),
    scale: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {};
    if (args.position !== undefined) patch.position = args.position;
    if (args.rotation !== undefined) patch.rotation = args.rotation;
    if (args.scale !== undefined) patch.scale = args.scale;
    await ctx.db.patch(args.buildingId, patch);
  },
});

export const updateProceduralCodeInternal = internalMutation({
  args: {
    buildingId: v.id("buildings"),
    proceduralCode: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.buildingId, {
      proceduralCode: args.proceduralCode,
    });
  },
});

export const updateProceduralCode = mutation({
  args: {
    buildingId: v.id("buildings"),
    proceduralCode: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.buildingId, {
      proceduralCode: args.proceduralCode,
    });
  },
});
