import { NextResponse } from "next/server";
import { callWithFallback } from "@/lib/llm/provider-chain";

export async function POST(request: Request) {
  try {
    const { buildingName, views } = await request.json();

    if (!buildingName || !views) {
      return NextResponse.json(
        { error: "buildingName and views are required" },
        { status: 400 }
      );
    }

    const imageUrls: string[] = [];
    for (const view of ["front", "right", "back", "left"] as const) {
      const url = views[view];
      if (url) imageUrls.push(url);
    }

    const prompt = `You are an expert Three.js developer. I'm showing you reference views of a building described as "${buildingName}" (front, right, back, left elevations).

Generate JavaScript code that creates a THREE.Group representing this building using procedural geometry.

IMPORTANT: The description may be creative or fantastical (e.g. "a beaver-shaped building", "a mushroom tower", "a building that looks like a guitar"). Study the reference images carefully and recreate the unique shape, silhouette, and features you see. The 3D model should clearly look like the subject described — capture its distinctive outline, proportions, and character.

REQUIREMENTS:
- CRITICAL SIZING: The building sits on a 100×100 unit plot. The XZ footprint must stay within 100×100. Use as much space as the building naturally needs — a bridge should be long, a stadium should be wide.
- HEIGHT MUST MATCH REAL-WORLD SCALE relative to the building type. Use 1 unit ≈ 1 meter:
  - Small house / cabin / shed: 5–10 units tall
  - Regular house / villa / bungalow: 8–15 units tall
  - Townhouse / small apartment: 15–25 units tall
  - Mid-rise office / apartment block: 30–60 units tall
  - Tall office tower / skyscraper: 80–150 units tall
  - Supertall skyscraper (Burj Khalifa, etc.): 200–400+ units tall
  Pick the height that matches what "${buildingName}" would actually be in real life. A cottage must NOT be the same height as a skyscraper!
- Return ONLY a JavaScript function body that will be wrapped in: function(THREE) { ... return group; }
- Create a THREE.Group as the root
- Use THREE.BoxGeometry, THREE.CylinderGeometry, THREE.SphereGeometry, THREE.ExtrudeGeometry, THREE.Shape, THREE.LatheGeometry, etc. — use whatever geometry types best capture the shape
- IMPORTANT: Use THREE.MeshStandardMaterial (NOT MeshPhysicalMaterial). Always set side: THREE.DoubleSide on every material.
- NO texture loading, NO external files
- Build the model centered at origin (0,0,0) on XZ, with the base at Y=0 (Y-up)
- Keep the footprint within ±50 on X and ±50 on Z (100×100 total).
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

    const text = await callWithFallback(prompt, imageUrls);

    // Extract code from markdown code blocks
    const codeMatch = text.match(/```(?:javascript|js)?\s*\n([\s\S]*?)```/);
    const code = codeMatch ? codeMatch[1].trim() : text.trim();

    if (!code) {
      throw new Error("LLM returned no usable geometry code");
    }

    // Validate syntax before sending to client
    try {
      new Function("THREE", `"use strict";\n${code}`);
    } catch (syntaxErr) {
      console.error("[API/geometry] LLM returned invalid code:", syntaxErr);
      throw new Error("LLM returned code with syntax errors (likely truncated output)");
    }

    return NextResponse.json({ code });
  } catch (err) {
    console.error("[API/geometry] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
