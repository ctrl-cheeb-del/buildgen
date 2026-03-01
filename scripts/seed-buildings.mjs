#!/usr/bin/env node
/**
 * Seeds buildings from a JSON file into Convex, then fills all 80 plots with 4-8 buildings each.
 * Usage: node scripts/seed-buildings.mjs [/path/to/buildings.json]
 */
import { execSync } from "child_process";
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const TOTAL_PLOTS = 80;
const file = process.argv[2] || "/Users/george/Downloads/message (9).txt";
const buildings = JSON.parse(readFileSync(file, "utf-8"));

console.log(`Loaded ${buildings.length} buildings from ${file}`);

// Step 1: Clear demo buildings per-plot
console.log("\n--- Clearing demo buildings per-plot ---");
for (let i = 0; i < TOTAL_PLOTS; i++) {
  const result = execSync(`npx convex run fillWorld:clearPlot '{"plotIndex":${i}}'`, { encoding: "utf-8" });
  const match = result.match(/"deleted":\s*(\d+)/);
  const deleted = match ? parseInt(match[1]) : 0;
  if (deleted > 0) process.stdout.write(`  Plot ${i}: cleared ${deleted} | `);
}
console.log("\nClearing done.");

// Step 2: Seed each building into buildingDesigns cache
console.log(`\n--- Seeding ${buildings.length} designs into cache ---`);
for (let i = 0; i < buildings.length; i++) {
  const b = buildings[i];
  const args = { prompt: b.prompt, proceduralCode: b.proceduralCode };
  const tmpFile = join(tmpdir(), `seed-design-${i}.json`);
  writeFileSync(tmpFile, JSON.stringify(args));

  console.log(`[${i + 1}/${buildings.length}] "${b.prompt}"`);
  try {
    execSync(`npx convex run fillWorld:seedDesign "$(cat '${tmpFile}')"`, {
      stdio: "inherit",
      shell: "/bin/zsh",
    });
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

// Step 3: Fill each plot with 4-8 buildings
console.log(`\n--- Filling ${TOTAL_PLOTS} plots (4-8 buildings each) ---`);
let totalPlaced = 0;
for (let i = 0; i < TOTAL_PLOTS; i++) {
  const result = execSync(`npx convex run fillWorld:fillPlot '{"plotIndex":${i}}'`, { encoding: "utf-8" });
  const match = result.match(/"placed":\s*(\d+)/);
  const placed = match ? parseInt(match[1]) : 0;
  totalPlaced += placed;
  process.stdout.write(`Plot ${i}: +${placed} | `);
  if ((i + 1) % 8 === 0) console.log();
}

// Step 4: Update population
console.log("\n--- Updating population ---");
execSync("npx convex run fillWorld:updatePopulation", { stdio: "inherit" });

console.log(`\nDone! Placed ${totalPlaced} buildings across ${TOTAL_PLOTS} plots.`);
