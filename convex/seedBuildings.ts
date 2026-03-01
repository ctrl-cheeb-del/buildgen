import { mutation } from "./_generated/server";
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
