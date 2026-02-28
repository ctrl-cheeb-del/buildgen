import { NextResponse } from "next/server";
import { callWithFallback } from "@/lib/llm/provider-chain";

export async function POST(request: Request) {
  try {
    const {
      currentCode,
      renderScreenshots,
      referenceImages,
      stats,
      buildingName,
      feedback,
    } = await request.json();

    if (!currentCode || !renderScreenshots) {
      return NextResponse.json(
        { error: "currentCode and renderScreenshots are required" },
        { status: 400 }
      );
    }

    // Collect all images: current renders + reference images
    const imageUrls: string[] = [];
    const imageLabels: string[] = [];

    for (const view of ["front", "right", "back", "left"] as const) {
      if (renderScreenshots[view]) {
        imageUrls.push(renderScreenshots[view]);
        imageLabels.push(`Current render - ${view} view`);
      }
    }
    if (referenceImages) {
      for (const view of ["front", "right", "back", "left"] as const) {
        if (referenceImages[view]) {
          imageUrls.push(referenceImages[view]);
          imageLabels.push(`Reference target - ${view} view`);
        }
      }
    }

    const statsBlock = stats
      ? `
CURRENT GEOMETRY STATS:
- Dimensions: ${stats.dimensions.x} x ${stats.dimensions.y} x ${stats.dimensions.z}
- Height range: ${stats.minY} to ${stats.maxY}
- Footprint: ${stats.footprint.x} x ${stats.footprint.z}
- Grounded: ${stats.isGrounded ? "YES" : "NO (minY = " + stats.minY + ")"}
- Fits 30m footprint: ${stats.fitsFootprint ? "YES" : "NO"}
- Meshes: ${stats.meshCount}, Vertices: ${stats.vertexCount}
`
      : "";

    const feedbackBlock = feedback
      ? `\nHUMAN FEEDBACK:\n${feedback}\n`
      : "\nNo human feedback — self-evaluate by comparing current renders to reference images.\n";

    const imageDescriptions = imageLabels
      .map((label, i) => `Image ${i + 1}: ${label}`)
      .join("\n");

    const prompt = `You are an expert Three.js developer iterating on a procedural building model. Your #1 priority is VISUAL FIDELITY — the 3D render must look as close as possible to the reference images.

BUILDING: "${buildingName || "Unknown building"}"

I'm showing you ${imageUrls.length} images:
${imageDescriptions}

The first 4 images show what the building CURRENTLY looks like (front/right/back/left renders from the Three.js canvas).
${referenceImages ? "The next 4 images show what the building SHOULD look like (reference target views). These are the GROUND TRUTH — match them as closely as possible." : "No reference images provided — improve based on the building description."}

${statsBlock}${feedbackBlock}

CURRENT CODE:
\`\`\`javascript
${currentCode}
\`\`\`

YOUR TASK — VISUAL MATCHING IS THE TOP PRIORITY:
1. Study each current render view side-by-side with its corresponding reference view.
2. Focus on these visual aspects in order of importance:
   a. SILHOUETTE — does the outline/profile match? Fix major shape differences first.
   b. PROPORTIONS — are width/height/depth ratios correct? Compare relative sizes of features.
   c. DISTINCTIVE FEATURES — are key architectural elements present? (arches, towers, domes, windows, overhangs)
   d. COLOR & MATERIALS — do the colors and surface qualities match?
   e. GROUNDING & SCALE — is the building properly sitting on the ground, correctly sized?
3. Make targeted changes to fix the biggest visual discrepancies. Don't rewrite everything — preserve what already looks correct.

REQUIREMENTS:
- Return ONLY a JavaScript function body: function(THREE) { ... return group; }
- Create a THREE.Group as the root
- Use THREE.MeshStandardMaterial (NOT MeshPhysicalMaterial). Always set side: THREE.DoubleSide.
- CRITICAL SIZING: XZ footprint within 24x24. Height up to 80 units. Base at Y=0.
- NO texture loading, NO external files.
- Build centered at origin, Y-up.
- The code must be valid JavaScript that can run in a Function constructor.

First write a brief VISUAL ANALYSIS (2-3 sentences) comparing the current render to the reference — what looks wrong and what you'll fix. Then provide the complete corrected code.

FORMAT:
ANALYSIS: <your visual comparison analysis>

\`\`\`javascript
<complete corrected code>
\`\`\``;

    const text = await callWithFallback(prompt, imageUrls);

    // Extract analysis
    const analysisMatch = text.match(/ANALYSIS:\s*([\s\S]*?)```/);
    const analysis = analysisMatch
      ? analysisMatch[1].trim()
      : "Analysis not provided";

    // Extract code
    const codeMatch = text.match(/```(?:javascript|js)?\s*\n([\s\S]*?)```/);
    const code = codeMatch ? codeMatch[1].trim() : text.trim();

    if (!code) {
      throw new Error("LLM returned no usable code");
    }

    return NextResponse.json({ code, analysis });
  } catch (err) {
    console.error("[API/iterate] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
