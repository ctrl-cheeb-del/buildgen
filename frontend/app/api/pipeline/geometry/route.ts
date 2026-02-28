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
- CRITICAL SIZING: The building sits on a 100×100 unit plot. The XZ footprint must stay within 100×100.
- HEIGHT MUST MATCH REAL-WORLD SCALE relative to the building type. Use 1 unit ≈ 1 meter:
  - Small house / cabin / shed: 5–10 units tall
  - Regular house / villa / bungalow: 8–15 units tall
  - Townhouse / small apartment: 15–25 units tall
  - Mid-rise office / apartment block: 30–60 units tall
  - Tall office tower / skyscraper: 80–150 units tall
  - Supertall skyscraper (Burj Khalifa, etc.): 200–400+ units tall
  Pick the height that matches what "${buildingName}" would actually be in real life. A cottage must NOT be the same height as a skyscraper!
- WIDTH/DEPTH should also vary realistically — do NOT always fill the full 100×100 plot:
  - Small house / cabin: ~20×15
  - Regular house / villa: ~30×20
  - Mansion / estate: ~80×50 (wide, L-shaped or U-shaped)
  - Townhouse: ~15×20
  - Office tower / skyscraper: ~40×40
  - Supertall: ~50×50 at base, tapering upward
  Use varying widths and depths appropriate to the building type.
- Return ONLY a JavaScript function body that will be wrapped in: function(THREE) { ... return group; }
- Create a THREE.Group as the root
- Use THREE.BoxGeometry, THREE.CylinderGeometry, THREE.SphereGeometry, THREE.ExtrudeGeometry, THREE.Shape, THREE.LatheGeometry, etc. — use whatever geometry types best capture the shape
- IMPORTANT: Use THREE.MeshStandardMaterial (NOT MeshPhysicalMaterial). Do NOT set side: THREE.DoubleSide — use the default (FrontSide).
- Appropriate material colors matching what you see in the images:
  - Glass: { color: 0x88ccee, transparent: true, opacity: 0.4, metalness: 0.5, roughness: 0.1, depthWrite: false }
  - Concrete: { color: 0xcccccc, roughness: 0.8, metalness: 0.1 }
  - Steel: { color: 0xaaaaaa, metalness: 0.5, roughness: 0.3 }
  - Stone: { color: 0xd4c5a9, roughness: 0.9, metalness: 0.0 }
  - Use any other colors that match the reference images
- AVOID Z-FIGHTING: Never place two surfaces at the exact same position. If adding decorative panels, window frames, or details on a wall, offset them at least 0.3 units outward from the wall surface. Do NOT create overlapping coplanar geometry — it causes visual flickering.
- NO texture loading, NO external files
- Build the model centered at origin (0,0,0) on XZ, with the base at Y=0 (Y-up)
- Keep the footprint within ±50 on X and ±50 on Z (100×100 total).
- Focus on capturing the overall silhouette and distinctive features — make it immediately recognizable as "${buildingName}"
- Use THREE.Shape + ExtrudeGeometry for organic or curved cross-sections
- The code must be valid JavaScript that can run in a Function constructor

EXAMPLE OUTPUT FORMAT:
\`\`\`javascript
const group = new THREE.Group();

const baseMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.8 });
const baseGeo = new THREE.BoxGeometry(20, 50, 20);
const base = new THREE.Mesh(baseGeo, baseMat);
base.position.y = 25;
group.add(base);

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

    return NextResponse.json({ code });
  } catch (err) {
    console.error("[API/geometry] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
