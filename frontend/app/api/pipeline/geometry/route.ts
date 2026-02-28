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
- CRITICAL SIZING: The building sits on a 24×24 unit plot. The XZ footprint must stay within 24×24. Height can be up to 80 units.
- Return ONLY a JavaScript function body that will be wrapped in: function(THREE) { ... return group; }
- Create a THREE.Group as the root
- Use THREE.BoxGeometry, THREE.CylinderGeometry, THREE.SphereGeometry, THREE.ExtrudeGeometry, THREE.Shape, THREE.LatheGeometry, etc. — use whatever geometry types best capture the shape
- IMPORTANT: Use THREE.MeshStandardMaterial (NOT MeshPhysicalMaterial). Always set side: THREE.DoubleSide on every material.
- Appropriate material colors matching what you see in the images:
  - Glass: { color: 0x88ccee, transparent: true, opacity: 0.4, metalness: 0.5, roughness: 0.1, side: THREE.DoubleSide }
  - Concrete: { color: 0xcccccc, roughness: 0.8, metalness: 0.1, side: THREE.DoubleSide }
  - Steel: { color: 0xaaaaaa, metalness: 0.5, roughness: 0.3, side: THREE.DoubleSide }
  - Stone: { color: 0xd4c5a9, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide }
  - Use any other colors that match the reference images, always with side: THREE.DoubleSide
- NO texture loading, NO external files
- Build the model centered at origin (0,0,0) on XZ, with the base at Y=0 (Y-up)
- Keep the footprint within ±12 on X and ±12 on Z (24×24 total). Height up to 80 units.
- Focus on capturing the overall silhouette and distinctive features — make it immediately recognizable as "${buildingName}"
- Use THREE.Shape + ExtrudeGeometry for organic or curved cross-sections
- The code must be valid JavaScript that can run in a Function constructor

EXAMPLE OUTPUT FORMAT:
\`\`\`javascript
const group = new THREE.Group();

const baseMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.8, side: THREE.DoubleSide });
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
