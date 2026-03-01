import { readFileSync } from "fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

// Production URL - update if different from dev
const PROD_URL =
  process.env.CONVEX_PROD_URL ||
  "https://rugged-puffin-771.convex.cloud";

const client = new ConvexHttpClient(PROD_URL);

const buildings = JSON.parse(readFileSync("exported-buildings.json", "utf-8"));

const payload = buildings.map((b: any) => ({
  prompt: b.prompt,
  proceduralCode: b.proceduralCode,
  rotation: b.rotation ?? undefined,
}));

const BATCH_SIZE = 5;

console.log(`Seeding ${payload.length} buildings to ${PROD_URL}...`);

for (let i = 0; i < payload.length; i += BATCH_SIZE) {
  const batch = payload.slice(i, i + BATCH_SIZE);
  console.log(
    `  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(payload.length / BATCH_SIZE)}: ${batch.map((b: any) => b.prompt).join(", ")}`
  );

  try {
    const result = await client.mutation(api.seedBuildings.seed, {
      buildings: batch,
    });
    console.log(`    ✓`, result);
  } catch (e: any) {
    console.error(`    ✗ ${e.message}`);
  }
}

console.log("Done!");
