#!/usr/bin/env bun
/**
 * Export buildings from production, deduplicate agent spam, and save to seed-data.json.
 *
 * Usage: bun scripts/export-prod-buildings.ts
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { writeFileSync } from "fs";

const PROD_URL =
  process.env.CONVEX_PROD_URL || "https://rugged-puffin-771.convex.cloud";

const USER_PLOTS = new Set([0, 1, 35]);

const client = new ConvexHttpClient(PROD_URL);

interface Building {
  _id: string;
  plotIndex: number;
  ownerId: string;
  prompt: string;
  proceduralCode: string;
  multiViewGrid?: string;
  position?: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number };
  scale?: number;
  category?: string;
  createdAt: number;
}

async function main() {
  console.log(`Fetching buildings from ${PROD_URL}...`);
  // Use getAllBuildings (already deployed) instead of exportBuildings
  const buildings: Building[] = await client.query(
    api.buildings.getAllBuildings
  );
  console.log(`Got ${buildings.length} total buildings`);

  // Group by plot
  const byPlot = new Map<number, Building[]>();
  for (const b of buildings) {
    const arr = byPlot.get(b.plotIndex) ?? [];
    arr.push(b);
    byPlot.set(b.plotIndex, arr);
  }

  const result: Array<{
    prompt: string;
    proceduralCode: string;
    multiViewGrid?: string;
    position?: { x: number; y: number; z: number };
    rotation?: { x: number; y: number; z: number };
    scale?: number;
    category?: string;
    sourcePlot: number;
    tag: "landmark" | "agent-unique";
  }> = [];

  // Process each plot
  for (const [plotIndex, plotBuildings] of byPlot) {
    if (plotIndex === -1) continue; // skip unplaced seeds

    if (USER_PLOTS.has(plotIndex)) {
      // Keep ALL user buildings (they're already unique)
      for (const b of plotBuildings) {
        result.push({
          prompt: b.prompt,
          proceduralCode: b.proceduralCode,
          multiViewGrid: b.multiViewGrid,
          position: b.position,
          rotation: b.rotation,
          scale: b.scale,
          category: b.category,
          sourcePlot: plotIndex,
          tag: "landmark",
        });
      }
      console.log(
        `  Plot ${plotIndex} (user): ${plotBuildings.length} buildings kept`
      );
    } else {
      // Agent plot — deduplicate by prompt, keep only 1 per unique prompt
      const seen = new Set<string>();
      let kept = 0;
      for (const b of plotBuildings) {
        const key = b.prompt.toLowerCase().trim();
        if (seen.has(key)) continue;
        seen.add(key);

        result.push({
          prompt: b.prompt,
          proceduralCode: b.proceduralCode,
          multiViewGrid: b.multiViewGrid,
          position: b.position,
          rotation: b.rotation,
          scale: b.scale,
          category: b.category,
          sourcePlot: plotIndex,
          tag: "agent-unique",
        });
        kept++;
      }
      if (kept > 0) {
        console.log(
          `  Plot ${plotIndex} (agent): ${kept}/${plotBuildings.length} unique kept`
        );
      }
    }
  }

  // Summary
  const landmarks = result.filter((b) => b.tag === "landmark").length;
  const agentUnique = result.filter((b) => b.tag === "agent-unique").length;
  console.log(`\nTotal: ${result.length} buildings`);
  console.log(`  Landmarks: ${landmarks}`);
  console.log(`  Agent unique: ${agentUnique}`);

  const outPath = "scripts/seed-data.json";
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`\nSaved to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
