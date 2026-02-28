import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { callWithFallback } from "@/lib/llm/provider-chain";

const convex = new ConvexHttpClient(
  process.env.NEXT_PUBLIC_CONVEX_URL as string
);

/**
 * POST /api/pipeline/regen-all
 *
 * Regenerates procedural code for all existing buildings using the
 * current geometry prompt (which now includes texture annotations).
 * Re-uses cached multi-view images from Convex for each building.
 *
 * Returns a streaming log of progress.
 */
export async function POST() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function log(msg: string) {
        controller.enqueue(encoder.encode(msg + "\n"));
      }

      try {
        const buildings = await convex.query(api.buildings.getAllBuildings);
        log(`Found ${buildings.length} buildings to regenerate`);

        let success = 0;
        let failed = 0;

        for (const b of buildings) {
          const id = b._id;
          const name = b.prompt;
          log(`\n[${success + failed + 1}/${buildings.length}] Regenerating "${name}"...`);

          try {
            // Fetch cached multi-view images
            const views = await convex.query(
              api.multiViewPreviews.getUrlsByBuildingName,
              { buildingName: name }
            );

            const imageUrls: string[] = [];
            if (views) {
              for (const key of ["front", "right", "back", "left"] as const) {
                const url = views[key];
                if (url) imageUrls.push(url);
              }
            }

            if (imageUrls.length === 0) {
              log(`  WARNING: No cached views for "${name}", generating without reference images`);
            } else {
              log(`  Using ${imageUrls.length} cached reference images`);
            }

            // Build the same prompt as the geometry route
            const prompt = buildGeometryPrompt(name);
            const text = await callWithFallback(prompt, imageUrls);

            // Extract code from markdown
            const codeMatch = text.match(
              /```(?:javascript|js)?\s*\n([\s\S]*?)```/
            );
            const code = codeMatch ? codeMatch[1].trim() : text.trim();

            if (!code) {
              log(`  ERROR: LLM returned no usable code`);
              failed++;
              continue;
            }

            // Verify it mentions textureId
            const hasTextures = code.includes("textureId");
            log(
              `  Code generated (${code.length} chars, textures: ${hasTextures ? "YES" : "NO"})`
            );

            // Update in Convex
            await convex.mutation(api.buildings.updateProceduralCode, {
              buildingId: id,
              proceduralCode: code,
            });

            log(`  Updated in Convex`);
            success++;
          } catch (err) {
            log(
              `  ERROR: ${err instanceof Error ? err.message : String(err)}`
            );
            failed++;
          }
        }

        log(`\nDone! ${success} succeeded, ${failed} failed out of ${buildings.length}`);
      } catch (err) {
        log(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
    },
  });
}

/** Same prompt as geometry/route.ts — kept in sync */
function buildGeometryPrompt(buildingName: string): string {
  return `You are an expert Three.js developer. I'm showing you reference views of a building described as "${buildingName}" (front, right, back, left elevations).

Generate JavaScript code that creates a THREE.Group representing this building using procedural geometry.

IMPORTANT: The description may be creative or fantastical (e.g. "a beaver-shaped building", "a mushroom tower", "a building that looks like a guitar"). Study the reference images carefully and recreate the unique shape, silhouette, and features you see. The 3D model should clearly look like the subject described — capture its distinctive outline, proportions, and character.

REQUIREMENTS:
- CRITICAL: Use 1 unit = 1 meter. ALL dimensions (height, width, depth) must match real-world scale. The plot is 100×100 but most buildings should NOT fill it — use realistic footprints:
  FOOTPRINT (width × depth):
  - Small house / cabin / shed: ~10×8
  - Regular house / villa: ~15×12
  - Pub / shop / small restaurant: ~15×12
  - Church / temple: ~20×35
  - Townhouse: ~8×15
  - Mansion / estate: ~30×25
  - Mid-rise office / apartment block: ~30×25
  - Tall office tower / skyscraper: ~40×40
  - Supertall skyscraper: ~60×60 at base
  - Stadium / arena: ~80×60
  - Bridge: ~80×15 (long but narrow)
  HEIGHT:
  - Small house / cabin / shed: 5–10m
  - Regular house / villa / bungalow: 8–15m
  - Townhouse / small apartment: 15–25m
  - Mid-rise office / apartment block: 30–60m
  - Tall office tower / skyscraper: 80–150m
  - Supertall skyscraper (Burj Khalifa, etc.): 200–400+m
  Pick dimensions that match what "${buildingName}" would actually be in real life. A cottage must NOT be the same size as a skyscraper! Only use the full plot if the building genuinely needs it (e.g. a massive stadium).
- Return ONLY a JavaScript function body that will be wrapped in: function(THREE) { ... return group; }
- Create a THREE.Group as the root
- Use THREE.BoxGeometry, THREE.CylinderGeometry, THREE.SphereGeometry, THREE.ExtrudeGeometry, THREE.Shape, THREE.LatheGeometry, etc. — use whatever geometry types best capture the shape
- IMPORTANT: Use THREE.MeshStandardMaterial (NOT MeshPhysicalMaterial). Always set side: THREE.DoubleSide on every material.
- NO texture loading, NO external files
- Build the model centered at origin (0,0,0) on XZ, with the base at Y=0 (Y-up)
- Maximum footprint: ±50 on X and ±50 on Z (100×100 hard limit), but use realistic dimensions — do NOT fill the plot unless the building actually needs it.
- Focus on capturing the overall silhouette and distinctive features — make it immediately recognizable as "${buildingName}"
- Use THREE.Shape + ExtrudeGeometry for organic or curved cross-sections
- The code must be valid JavaScript that can run in a Function constructor

TEXTURE ANNOTATIONS:
AI-generated tileable textures will be applied automatically after your code runs. For every mesh, set mesh.userData.textureId to one of the available texture IDs listed below. Use color 0xffffff for untinted textures, or a subtle color to shift the hue. Do NOT set textureId on organic ExtrudeGeometry shapes (UV tiling is imperfect there) — leave those with solid colors.

Available texture IDs:
- "glass-curtainwall" — reflective glass curtain wall with aluminium mullions (skyscraper facades)
- "glass-frosted" — frosted translucent glass (stairwells, bathroom windows)
- "concrete-smooth" — smooth poured concrete (modern buildings)
- "concrete-exposed" — rough exposed aggregate concrete (brutalist, industrial)
- "concrete-precast" — precast concrete panels (commercial buildings)
- "stone-ashlar" — cut limestone blocks (classical, institutional)
- "stone-granite" — polished grey granite (lobbies, bases)
- "steel-panel" — corrugated steel cladding (industrial, warehouses)
- "copper-patina" — green verdigris patina copper (domes, ornamental)
- "metal-zinc" — matte zinc cladding with standing seams (modern)
- "brick-red" — classic red brick running bond (residential, traditional)
- "brick-white" — white painted brick (modern residential, commercial)
- "brick-dark" — dark charcoal brick (contemporary)
- "wood-siding" — horizontal clapboard siding (houses, cabins)
- "wood-plywood" — birch plywood panel (temporary, interior)
- "wood-decking" — timber deck boards (balconies, porches)
- "stucco-white" — white stucco plaster (Mediterranean, residential)
- "terracotta-panel" — terracotta rainscreen panels (modern facades)
- "roof-tiles" — clay roof tiles (residential roofs)
- "metal-grating" — diamond plate steel (industrial floors)

EXAMPLE OUTPUT FORMAT:
\`\`\`javascript
const group = new THREE.Group();

const baseMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide });
const baseGeo = new THREE.BoxGeometry(20, 50, 20);
const base = new THREE.Mesh(baseGeo, baseMat);
base.userData.textureId = "concrete-smooth";
base.position.y = 25;
group.add(base);

const glassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, metalness: 0.5, roughness: 0.1, side: THREE.DoubleSide });
const glassGeo = new THREE.BoxGeometry(18, 3, 18);
const glass = new THREE.Mesh(glassGeo, glassMat);
glass.userData.textureId = "glass-curtainwall";
glass.position.y = 48;
group.add(glass);

// ... more geometry ...

return group;
\`\`\`

Generate the code now for "${buildingName}". Study the images closely and make the 3D model match what you see.`;
}
