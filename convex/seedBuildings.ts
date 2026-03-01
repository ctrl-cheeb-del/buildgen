import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const seed = mutation({
  args: {
    buildings: v.array(
      v.object({
        prompt: v.string(),
        proceduralCode: v.string(),
        rotation: v.optional(
          v.object({ x: v.number(), y: v.number(), z: v.number() })
        ),
      })
    ),
  },
  handler: async (ctx, { buildings }) => {
    let inserted = 0;
    let skipped = 0;

    for (const building of buildings) {
      // Check if a building with similar prompt already exists as a seed
      const existing = await ctx.db
        .query("buildings")
        .withSearchIndex("search_prompt", (q) =>
          q.search("prompt", building.prompt)
        )
        .first();

      // Skip if there's already a seeded building with the exact same prompt
      if (existing && existing.ownerId === "seed" && existing.prompt === building.prompt) {
        skipped++;
        continue;
      }

      await ctx.db.insert("buildings", {
        plotIndex: -1,
        ownerId: "seed",
        prompt: building.prompt,
        proceduralCode: building.proceduralCode,
        rotation: building.rotation,
        createdAt: Date.now(),
      });
      inserted++;
    }

    return { inserted, skipped };
  },
});

/**
 * Move all seeded buildings (ownerId="seed", plotIndex=-1) onto random empty
 * plots. Claims the plot for a fake agent and gives the building a proper
 * position within the plot grid.
 */
export const placeSeeded = mutation({
  args: {},
  handler: async (ctx) => {
    // 1. Gather seeded buildings that haven't been placed yet
    const allBuildings = await ctx.db.query("buildings").collect();
    const seeded = allBuildings.filter(
      (b) => b.ownerId === "seed" && b.plotIndex === -1
    );

    if (seeded.length === 0) {
      return { placed: 0, message: "No unplaced seed buildings found" };
    }

    // 2. Find empty plots
    const allPlots = await ctx.db.query("plots").collect();
    const emptyPlots = allPlots.filter((p) => p.status === "empty");

    // Shuffle empty plots for randomness
    for (let i = emptyPlots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [emptyPlots[i], emptyPlots[j]] = [emptyPlots[j], emptyPlots[i]];
    }

    // 3. Building position candidates (same as buildings.ts grid)
    const GRID_SPACING = 36;
    const CANDIDATES: [number, number][] = [
      [-GRID_SPACING, -GRID_SPACING], [0, -GRID_SPACING], [GRID_SPACING, -GRID_SPACING],
      [-GRID_SPACING, 0],                                  [GRID_SPACING, 0],
      [-GRID_SPACING, GRID_SPACING],  [0, GRID_SPACING],  [GRID_SPACING, GRID_SPACING],
      [0, 0],
    ];

    // Agent name pool for variety
    const agentNames = [
      "Ada", "Kai", "Soren", "Mira", "Luca", "Zara", "Felix", "Iris",
      "Dante", "Nova", "Elara", "Cassius", "Thea", "Orion", "Lyra",
      "Jasper", "Freya", "Atlas",
    ];

    let placed = 0;
    let plotIdx = 0;

    for (const building of seeded) {
      if (plotIdx >= emptyPlots.length) break;

      const plot = emptyPlots[plotIdx];
      plotIdx++;

      const agentName = agentNames[placed % agentNames.length];
      const ownerId = `agent:${agentName}`;

      // Pick a random position from candidates
      const [cx, cz] = CANDIDATES[Math.floor(Math.random() * CANDIDATES.length)];

      // Claim the plot
      await ctx.db.patch(plot._id, {
        status: "occupied" as const,
        ownerId,
        ownerName: agentName,
        isAgentOwned: true,
      });

      // Update the building to belong to this plot/agent
      await ctx.db.patch(building._id, {
        plotIndex: plot.index,
        ownerId,
        position: { x: cx, y: 0, z: cz },
      });

      placed++;
    }

    return { placed, totalSeeded: seeded.length, emptyPlotsAvailable: emptyPlots.length };
  },
});

/**
 * Clean seed: directly place buildings onto claimed agent plots that have no
 * buildings yet, or empty plots. Assigns them to the existing plot owner (if
 * agent-owned) or creates a new agent owner. No intermediate "seed" step.
 */
export const seedAndPlace = mutation({
  args: {
    buildings: v.array(
      v.object({
        prompt: v.string(),
        proceduralCode: v.string(),
        rotation: v.optional(
          v.object({ x: v.number(), y: v.number(), z: v.number() })
        ),
      })
    ),
  },
  handler: async (ctx, { buildings }) => {
    // 1. Get all plots and all existing buildings
    const allPlots = await ctx.db.query("plots").collect();
    const allBuildings = await ctx.db.query("buildings").collect();

    // Build a set of plot indexes that already have buildings
    const plotsWithBuildings = new Set(allBuildings.map((b) => b.plotIndex));

    // 2. Find target plots: claimed agent plots with NO buildings, then empty plots
    const claimedNoBuildings = allPlots.filter(
      (p) =>
        p.status === "claimed" &&
        p.isAgentOwned &&
        !plotsWithBuildings.has(p.index)
    );
    const emptyPlots = allPlots.filter((p) => p.status === "empty");
    const targetPlots = [...claimedNoBuildings, ...emptyPlots];

    // Shuffle for randomness
    for (let i = targetPlots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [targetPlots[i], targetPlots[j]] = [targetPlots[j], targetPlots[i]];
    }

    // Agent name pool for empty plots that need an owner
    const agentNames = [
      "Arlo", "Bea", "Cleo", "Dash", "Eve", "Finn", "Gia", "Haze",
      "Io", "Jett", "Kit", "Luna", "Max", "Nyx", "Opal", "Pike",
      "Quinn", "Rune",
    ];

    let placed = 0;
    let plotIdx = 0;

    for (const building of buildings) {
      if (plotIdx >= targetPlots.length) break;

      const plot = targetPlots[plotIdx];
      plotIdx++;

      // Determine owner - use existing agent owner or create one
      let ownerId: string;
      let ownerName: string;
      if (plot.isAgentOwned && plot.ownerId) {
        ownerId = plot.ownerId;
        ownerName = plot.ownerName ?? plot.ownerId.replace("agent:", "");
      } else {
        ownerName = agentNames[placed % agentNames.length];
        ownerId = `agent:${ownerName}`;
      }

      // Mark plot as occupied
      await ctx.db.patch(plot._id, {
        status: "occupied" as const,
        ownerId,
        ownerName,
        isAgentOwned: true,
      });

      // Insert building with center position (0,0)
      await ctx.db.insert("buildings", {
        plotIndex: plot.index,
        ownerId,
        prompt: building.prompt,
        proceduralCode: building.proceduralCode,
        rotation: building.rotation,
        position: { x: 0, y: 0, z: 0 },
        createdAt: Date.now(),
      });

      placed++;
    }

    return {
      placed,
      totalInput: buildings.length,
      targetPlotsAvailable: targetPlots.length,
    };
  },
});

/**
 * Delete old seeded buildings (short agent names from previous seed attempts)
 * and reset their plots.
 */
export const cleanOldSeeds = mutation({
  args: {},
  handler: async (ctx) => {
    const shortAgents = [
      "agent:Ada", "agent:Kai", "agent:Soren", "agent:Mira",
      "agent:Luca", "agent:Zara", "agent:Felix", "agent:Iris",
    ];

    const allBuildings = await ctx.db.query("buildings").collect();
    const allPlots = await ctx.db.query("plots").collect();

    let deleted = 0;
    let plotsReset = 0;

    for (const building of allBuildings) {
      if (shortAgents.includes(building.ownerId) || building.ownerId === "seed") {
        await ctx.db.delete(building._id);
        deleted++;
      }
    }

    for (const plot of allPlots) {
      if (plot.ownerId && shortAgents.includes(plot.ownerId)) {
        // Check if this plot still has any buildings after cleanup
        const remaining = allBuildings.filter(
          (b) => b.plotIndex === plot.index && !shortAgents.includes(b.ownerId) && b.ownerId !== "seed"
        );
        if (remaining.length === 0) {
          await ctx.db.patch(plot._id, {
            status: "empty" as const,
            ownerId: undefined,
            ownerName: undefined,
            isAgentOwned: undefined,
          });
          plotsReset++;
        }
      }
    }

    return { deleted, plotsReset };
  },
});

/** Debug: list all buildings with just metadata (no proceduralCode) */
export const listBuildingMeta = query({
  args: {},
  handler: async (ctx) => {
    const buildings = await ctx.db.query("buildings").collect();
    return buildings.map((b) => ({
      _id: b._id,
      plotIndex: b.plotIndex,
      ownerId: b.ownerId,
      prompt: b.prompt,
      position: b.position,
      rotation: b.rotation,
      category: b.category,
    }));
  },
});

/** List all plots with their status */
export const listPlotMeta = query({
  args: {},
  handler: async (ctx) => {
    const plots = await ctx.db.query("plots").collect();
    return plots.map((p) => ({
      _id: p._id,
      index: p.index,
      col: p.col,
      row: p.row,
      status: p.status,
      ownerId: p.ownerId,
      ownerName: p.ownerName,
      isAgentOwned: p.isAgentOwned,
    }));
  },
});
