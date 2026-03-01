#!/usr/bin/env bun
/**
 * Calls reseedCity:run on production with the exported seed data.
 *
 * Usage: bun scripts/run-reseed.ts
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { readFileSync } from "fs";

const PROD_URL =
  process.env.CONVEX_PROD_URL || "https://rugged-puffin-771.convex.cloud";

const SEED_FILE = "scripts/seed-data.json";

async function main() {
  const buildings = JSON.parse(readFileSync(SEED_FILE, "utf-8"));
  console.log(`Loaded ${buildings.length} buildings from ${SEED_FILE}`);

  const client = new ConvexHttpClient(PROD_URL);

  console.log(`Calling reseedCity:run on ${PROD_URL}...`);
  console.log("This may take a few minutes (agent initialization generates backstories)...");

  const result = await client.action(api.reseedCity.run, { buildings });
  console.log("Result:", JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
