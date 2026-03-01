import { internalMutation } from "./_generated/server";

/**
 * Clears all world/simulation state while preserving cached building designs
 * and multi-view previews.
 *
 * Run from the Convex dashboard → Functions → resetWorld:run
 * or via CLI: npx convex run resetWorld:run
 */
export const run = internalMutation(async ({ db }) => {
  const tables = [
    "plots",
    "buildings",
    "cars",
    "cityState",
    "agents",
    "agentMessages",
    "tickLog",
    "elections",
  ] as const;

  const counts: Record<string, number> = {};

  for (const table of tables) {
    let count = 0;
    const docs = await db.query(table).collect();
    for (const doc of docs) {
      await db.delete(doc._id);
      count++;
    }
    counts[table] = count;
  }

  // Re-seed 80 empty plots (8 cols x 10 rows)
  const GRID_COLS = 8;
  const GRID_ROWS = 10;
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      await db.insert("plots", {
        index: row * GRID_COLS + col,
        col,
        row,
        status: "empty",
      });
    }
  }

  console.log("World reset complete:", counts, "| Re-seeded 80 plots");
});
