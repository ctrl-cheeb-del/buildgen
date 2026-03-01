import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

// 3x3 sub-grid positions within a plot (same as buildings.ts)
const S = 36;
const SUB_GRID: [number, number][] = [
  [-S, -S], [0, -S], [S, -S],
  [-S,  0], [0,  0], [S,  0],
  [-S,  S], [0,  S], [S,  S],
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Fill a single plot with 4-8 buildings, reading templates from buildingDesigns table.
 * Called per-plot by the seed script.
 */
export const fillPlot = internalMutation({
  args: { plotIndex: v.number() },
  handler: async (ctx, { plotIndex }) => {
    // Read templates from the small buildingDesigns table
    const designs = await ctx.db.query("buildingDesigns").collect();
    if (designs.length === 0) return { placed: 0 };

    // Get existing buildings on this plot
    const existing = await ctx.db
      .query("buildings")
      .withIndex("by_plotIndex", (q) => q.eq("plotIndex", plotIndex))
      .collect();

    const takenPositions = new Set(
      existing.map((b) => `${b.position?.x ?? 0},${b.position?.z ?? 0}`)
    );
    const freeSlots = SUB_GRID.filter(
      ([x, z]) => !takenPositions.has(`${x},${z}`)
    );
    if (freeSlots.length === 0) return { placed: 0 };

    const target = Math.max(0, randInt(4, 8) - existing.length);
    const toPlace = Math.min(target, freeSlots.length);
    const shuffled = [...freeSlots].sort(() => Math.random() - 0.5);

    for (let i = 0; i < toPlace; i++) {
      const [x, z] = shuffled[i];
      const design = pickRandom(designs);

      await ctx.db.insert("buildings", {
        plotIndex,
        ownerId: "demo-fill",
        prompt: design.originalPrompt,
        proceduralCode: design.proceduralCode,
        category: design.category as any,
        position: { x, y: 0, z },
        createdAt: Date.now(),
      });
    }

    // Mark plot occupied
    const plots = await ctx.db
      .query("plots")
      .withIndex("by_index", (q) => q.eq("index", plotIndex))
      .collect();
    if (plots[0] && plots[0].status === "empty") {
      await ctx.db.patch(plots[0]._id, {
        status: "occupied",
        ownerId: plots[0].ownerId || "demo-fill",
        ownerName: plots[0].ownerName || "Demo City",
        isAgentOwned: true,
      });
    }

    return { placed: toPlace };
  },
});

/**
 * Clear demo buildings on a single plot. Called per-plot to avoid OCC/read limits.
 */
export const clearPlot = internalMutation({
  args: { plotIndex: v.number() },
  handler: async (ctx, { plotIndex }) => {
    const buildings = await ctx.db
      .query("buildings")
      .withIndex("by_plotIndex", (q) => q.eq("plotIndex", plotIndex))
      .collect();

    let deleted = 0;
    for (const b of buildings) {
      if (b.ownerId === "demo-fill" || b.ownerId === "demo-seed") {
        await ctx.db.delete(b._id);
        deleted++;
      }
    }

    if (deleted > 0) {
      // Check if plot has any buildings left
      const remaining = buildings.length - deleted;
      if (remaining === 0) {
        const plots = await ctx.db
          .query("plots")
          .withIndex("by_index", (q) => q.eq("index", plotIndex))
          .collect();
        if (plots[0] && (plots[0].ownerId === "demo-fill" || plots[0].ownerId === "demo-seed")) {
          await ctx.db.patch(plots[0]._id, {
            status: "empty",
            ownerId: undefined,
            ownerName: undefined,
            isAgentOwned: undefined,
          });
        }
      }
    }

    return { deleted };
  },
});

/**
 * Seed a building design into the buildingDesigns cache table.
 * This is the template source for fillPlot.
 */
export const seedDesign = internalMutation({
  args: {
    prompt: v.string(),
    proceduralCode: v.string(),
  },
  handler: async (ctx, { prompt, proceduralCode }) => {
    // Use prompt + code length as unique key to allow multiple designs with same prompt
    const key = `${prompt.toLowerCase().trim()}_${proceduralCode.length}`;
    const existing = await ctx.db
      .query("buildingDesigns")
      .withIndex("by_normalizedPrompt", (q) => q.eq("normalizedPrompt", key))
      .first();

    if (existing) {
      console.log(`Design "${prompt}" already cached, skipping.`);
      return existing._id;
    }

    const id = await ctx.db.insert("buildingDesigns", {
      normalizedPrompt: key,
      originalPrompt: prompt,
      proceduralCode,
      createdAt: Date.now(),
    });
    console.log(`Cached design "${prompt}" (${proceduralCode.length} chars)`);
    return id;
  },
});

/**
 * Update cityState population after filling.
 */
export const updatePopulation = internalMutation(async ({ db }) => {
  // Count total buildings (can't read all at once, so count per-plot)
  const plots = await db.query("plots").collect();
  let total = 0;
  for (const p of plots) {
    const buildings = await db
      .query("buildings")
      .withIndex("by_plotIndex", (q) => q.eq("plotIndex", p.index))
      .collect();
    total += buildings.length;
  }

  const cityStates = await db.query("cityState").collect();
  if (cityStates.length > 0) {
    await db.patch(cityStates[0]._id, {
      population: total * 10,
      activeBuildCount: total,
    });
  }

  console.log(`Updated population: ${total} buildings, ${total * 10} pop.`);
  return { buildings: total, population: total * 10 };
});
