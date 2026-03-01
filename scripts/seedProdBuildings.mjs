#!/usr/bin/env node
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { execSync } from "child_process";

const buildings = JSON.parse(readFileSync("exported-buildings.json", "utf-8"));

// Strip down to just what the mutation needs
const payload = buildings.map((b) => ({
  prompt: b.prompt,
  proceduralCode: b.proceduralCode,
  rotation: b.rotation ?? undefined,
}));

// Batch and run via temp file to avoid shell escaping issues
const BATCH_SIZE = 5;
const tmpFile = "/tmp/convex-seed-args.json";

for (let i = 0; i < payload.length; i += BATCH_SIZE) {
  const batch = payload.slice(i, i + BATCH_SIZE);
  const args = JSON.stringify({ buildings: batch });
  writeFileSync(tmpFile, args);

  console.log(
    `Seeding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(payload.length / BATCH_SIZE)} (${batch.length} buildings: ${batch.map((b) => b.prompt).join(", ")})...`
  );

  try {
    execSync(`npx convex run --prod seedBuildings:seed "$(cat ${tmpFile})"`, {
      stdio: "inherit",
      shell: "/bin/bash",
    });
    console.log("  ✓ Batch done");
  } catch (e) {
    console.error(`  ✗ Batch failed: ${e.message}`);
  }
}

try {
  unlinkSync(tmpFile);
} catch {}
console.log("Done seeding!");
