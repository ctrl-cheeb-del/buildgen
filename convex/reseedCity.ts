"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

const USER_PLOTS: Record<
  number,
  { ownerId: string; ownerName: string; ownerUsername: string }
> = {
  0: {
    ownerId: "user_3AIheMyaQmQJtcTfQmk4UqFs0mm",
    ownerName: "artfreebrey",
    ownerUsername: "artfreebrey",
  },
  1: {
    ownerId: "user_3AIsN4YY6O5qVJJawzkJxapJL9U",
    ownerName: "GeorgeJeffersn",
    ownerUsername: "GeorgeJeffersn",
  },
  35: {
    ownerId: "user_3AItZRpxvs2uBPzmXjGSUfUOk9G",
    ownerName: "therealoliulv",
    ownerUsername: "therealoliulv",
  },
};

const USER_PLOT_INDEXES = Object.keys(USER_PLOTS).map(Number);

const GRID_SPACING = 36;
const CANDIDATES: [number, number][] = [
  [0, 0],
  [-GRID_SPACING, -GRID_SPACING],
  [0, -GRID_SPACING],
  [GRID_SPACING, -GRID_SPACING],
  [-GRID_SPACING, 0],
  [GRID_SPACING, 0],
  [-GRID_SPACING, GRID_SPACING],
  [0, GRID_SPACING],
  [GRID_SPACING, GRID_SPACING],
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Full city reseed: reset → initialize agents → place exported buildings.
 * Called via: bun scripts/run-reseed.ts
 */
export const run = action({
  args: {
    buildings: v.array(
      v.object({
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
        category: v.optional(v.string()),
        sourcePlot: v.number(),
        tag: v.union(v.literal("landmark"), v.literal("agent-unique")),
      })
    ),
  },
  handler: async (ctx, { buildings }) => {
    console.log(`[reseed] Starting with ${buildings.length} buildings`);

    // ── Step 1: Reset world ──────────────────────────────────────────
    console.log("[reseed] Step 1: Resetting world...");
    await ctx.runMutation(internal.resetWorld.run);
    console.log("[reseed] World reset complete");

    // ── Step 2: Claim user plots BEFORE agent init ───────────────────
    console.log("[reseed] Step 2: Claiming user plots...");
    for (const [plotIndexStr, owner] of Object.entries(USER_PLOTS)) {
      const plotIndex = Number(plotIndexStr);
      await ctx.runMutation(internal.reseedCityHelpers.claimPlotForUser, {
        plotIndex,
        ownerId: owner.ownerId,
        ownerName: owner.ownerName,
        ownerUsername: owner.ownerUsername,
      });
    }
    console.log("[reseed] User plots claimed");

    // ── Step 3: Initialize agents (they'll skip occupied user plots) ─
    console.log("[reseed] Step 3: Initializing agents...");
    await ctx.runAction(internal.simulation.initialize.run);
    console.log("[reseed] Agents initialized");

    // ── Step 4: Boost starting conditions ────────────────────────────
    console.log("[reseed] Step 4: Boosting city & agent stats...");
    await ctx.runMutation(internal.reseedCityHelpers.boostConditions);
    console.log("[reseed] Conditions boosted");

    // ── Step 5: Place buildings ──────────────────────────────────────
    console.log("[reseed] Step 5: Placing buildings...");

    const userBuildings = buildings.filter((b) =>
      USER_PLOT_INDEXES.includes(b.sourcePlot)
    );

    // Agent pool = ALL buildings (landmarks + agent-unique) for variety
    const poolBuildings = [...buildings];

    // 5a: Place user buildings on their original plots
    for (const b of userBuildings) {
      const owner = USER_PLOTS[b.sourcePlot];
      await ctx.runMutation(internal.reseedCityHelpers.insertBuilding, {
        plotIndex: b.sourcePlot,
        ownerId: owner.ownerId,
        prompt: b.prompt,
        proceduralCode: b.proceduralCode,
        multiViewGrid: b.multiViewGrid,
        position: b.position ?? { x: 0, y: 0, z: 0 },
        rotation: b.rotation,
        scale: b.scale,
        category: b.category,
      });
    }
    console.log(`[reseed] Placed ${userBuildings.length} user buildings`);

    // 5b: Fill agent plots AND claim extra empty plots, leaving ~7 for humans
    const PLOTS_FOR_HUMANS = 7;

    const allAgentPlots: Array<{
      index: number;
      ownerId: string;
    }> = await ctx.runQuery(internal.reseedCityHelpers.getAgentPlots);

    // Also grab empty plots and claim them as agent overflow
    const emptyPlots: Array<{
      index: number;
    }> = await ctx.runQuery(internal.reseedCityHelpers.getEmptyPlots);

    const shuffledEmpty = shuffle(emptyPlots);
    const extraToFill = Math.max(0, shuffledEmpty.length - PLOTS_FOR_HUMANS);
    const extraPlots = shuffledEmpty.slice(0, extraToFill);

    // Claim the extra empty plots for filler agents
    const FILLER_NAMES = [
      "Arlo", "Bea", "Cleo", "Dash", "Eve", "Finn", "Gia", "Haze",
      "Io", "Jett", "Kit", "Luna", "Max", "Nyx", "Opal", "Pike",
      "Quinn", "Rune", "Sol", "Tess", "Uri", "Val", "Wren", "Xan",
      "Yves", "Zoe", "Axel", "Beck", "Cruz", "Dex",
    ];
    const extraWithOwner: Array<{ index: number; ownerId: string }> = [];
    for (let i = 0; i < extraPlots.length; i++) {
      const name = FILLER_NAMES[i % FILLER_NAMES.length];
      await ctx.runMutation(internal.reseedCityHelpers.claimPlotForAgent, {
        plotIndex: extraPlots[i].index,
        agentName: name,
      });
      extraWithOwner.push({
        index: extraPlots[i].index,
        ownerId: `agent:${name}`,
      });
    }

    // Combine: all agent plots + extra claimed plots
    const allPlotsToFill = [...allAgentPlots, ...extraWithOwner];

    console.log(
      `[reseed] Filling ${allPlotsToFill.length} plots (${allAgentPlots.length} agent + ${extraWithOwner.length} extra), leaving ${PLOTS_FOR_HUMANS} for humans`
    );

    const shuffledPool = shuffle(poolBuildings);
    let poolIdx = 0;
    let agentBuildingsPlaced = 0;

    for (const plot of allPlotsToFill) {
      const count = 4 + Math.floor(Math.random() * 2); // 4-5
      const usedPrompts = new Set<string>();

      for (let i = 0; i < count && poolIdx < shuffledPool.length; i++) {
        let building = shuffledPool[poolIdx];
        if (usedPrompts.has(building.prompt)) {
          poolIdx++;
          if (poolIdx >= shuffledPool.length) break;
          building = shuffledPool[poolIdx];
        }

        const [cx, cz] = CANDIDATES[i] ?? [0, 0];

        await ctx.runMutation(internal.reseedCityHelpers.insertBuilding, {
          plotIndex: plot.index,
          ownerId: plot.ownerId,
          prompt: building.prompt,
          proceduralCode: building.proceduralCode,
          multiViewGrid: building.multiViewGrid,
          position: { x: cx, y: 0, z: cz },
          rotation: building.rotation,
          scale: building.scale,
          category: building.category,
        });

        usedPrompts.add(building.prompt);
        poolIdx = (poolIdx + 1) % shuffledPool.length;
        agentBuildingsPlaced++;
      }

      await ctx.runMutation(internal.reseedCityHelpers.setPlotOccupied, {
        plotIndex: plot.index,
      });
    }

    console.log(
      `[reseed] Placed ${agentBuildingsPlaced} buildings on ${allPlotsToFill.length} plots`
    );

    // Mark user plots as occupied too
    for (const plotIndexStr of Object.keys(USER_PLOTS)) {
      await ctx.runMutation(internal.reseedCityHelpers.setPlotOccupied, {
        plotIndex: Number(plotIndexStr),
      });
    }

    console.log("[reseed] Complete!");
    return {
      status: "success",
      userBuildings: userBuildings.length,
      agentBuildings: agentBuildingsPlaced,
      agentPlotsOriginal: allAgentPlots.length,
      extraPlotsClaimed: extraWithOwner.length,
      totalPlotsFilled: allPlotsToFill.length,
      plotsLeftForHumans: PLOTS_FOR_HUMANS,
      totalBuildings: userBuildings.length + agentBuildingsPlaced,
    };
  },
});
