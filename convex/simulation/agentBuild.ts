"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import Replicate from "replicate";
import { Jimp } from "jimp";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { Mistral } from "@mistralai/mistralai";
import { withRetry } from "./mistral_retry";

/**
 * Call Bedrock Claude for text-only prompts (no images).
 * Reuses the same BedrockRuntimeClient + InvokeModelCommand pattern as the
 * image-based call at line ~203, but without image content blocks.
 */
async function callBedrockText(
  prompt: string,
  maxTokens = 8192,
): Promise<string> {
  const client = new BedrockRuntimeClient({
    region: process.env.AWS_DEFAULT_REGION || "us-west-2",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      sessionToken: process.env.AWS_SESSION_TOKEN,
    },
  });

  const body = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: maxTokens,
    messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
  });

  const command = new InvokeModelCommand({
    modelId: "us.anthropic.claude-opus-4-6-v1",
    contentType: "application/json",
    body: new TextEncoder().encode(body),
  });

  const response = await client.send(command);
  const result = JSON.parse(new TextDecoder().decode(response.body));
  const text: string | undefined = result.content?.[0]?.text;
  if (!text) throw new Error("Bedrock Claude Opus 4.6 returned no content");
  return text;
}

/**
 * Agent building action: reuses the existing pipeline.generateBuilding logic
 * but bypasses auth (agents aren't real users) and updates simulation state.
 */
export const run = internalAction({
  args: {
    plotIndex: v.number(),
    agentName: v.string(),
    buildDescription: v.string(),
    category: v.string(),
    tickNumber: v.optional(v.number()),
    skipReuse: v.optional(v.boolean()),
  },
  handler: async (ctx, { plotIndex, agentName, buildDescription, category, tickNumber, skipReuse }) => {
    console.log(`[agentBuild] ${agentName} building "${buildDescription}" on plot #${plotIndex}`);

    try {
      // 1. Mark plot as generating (shows loading cube)
      await ctx.runMutation(internal.plots.markGeneratingInternal, { plotIndex });

      // 1.5. Check for similar existing buildings to reuse
      const similar = await ctx.runQuery(internal.buildings.searchSimilarBuildings, {
        searchTerm: buildDescription,
        category,
      });

      if (similar) {
        console.log(`[agentBuild] Found similar building "${similar.prompt}", adapting...`);

        let finalCode: string;
        try {
          finalCode = await adaptExistingCode(
            similar.proceduralCode,
            similar.prompt,
            buildDescription,
          );
        } catch (adaptErr) {
          console.warn(
            `[agentBuild] Adaptation failed, falling back to original building code:`,
            adaptErr instanceof Error ? adaptErr.message : adaptErr,
          );
          finalCode = similar.proceduralCode;
        }

        // Skip directly to building creation — no image gen needed
        await ctx.runMutation(internal.buildings.createBuildingInternal, {
          plotIndex,
          ownerId: `agent:${agentName}`,
          prompt: buildDescription,
          proceduralCode: finalCode,
          multiViewGrid: undefined,
          createdAtTick: tickNumber,
        });

        await ctx.runMutation(internal.plots.resetPlotInternal, { plotIndex });
        await ctx.runMutation(internal.simulation._simBuildHelpers.onBuildComplete, {
          plotIndex,
          category,
          agentName,
        });

        console.log(`[agentBuild] "${buildDescription}" (adapted) complete on plot #${plotIndex}!`);
        return;
      }

      // 2. Generate multi-view image via Replicate
      const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

      const replicatePrompt = `Create a 2x2 contiguous grid of 4 distinct architectural elevation views of a building described as: "${buildDescription}".

- Top-left: Front elevation view
- Top-right: Right side elevation view
- Bottom-left: Rear elevation view
- Bottom-right: Left side elevation view

Each view should:
- Show the full building from ground to top
- Use clean architectural rendering style with sharp details
- Have a plain white background
- Maintain consistent scale and lighting across all 4 views
- Interpret the description as an actual real architectural structure
- No people, no cars, no surrounding buildings`;

      console.log(`[agentBuild] Generating views for "${buildDescription}"...`);
      const output: unknown = await replicate.run("google/nano-banana-2", {
        input: {
          prompt: replicatePrompt,
          aspect_ratio: "1:1",
          resolution: "2K",
          output_format: "png",
        },
      });

      // Get image buffer — handle the various formats Replicate can return
      let imageBuffer: Buffer;
      if (typeof output === "string") {
        const res = await fetch(output);
        if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
        imageBuffer = Buffer.from(await res.arrayBuffer());
      } else if (Array.isArray(output) && output.length > 0) {
        const first = output[0];
        if (typeof first === "string") {
          const res = await fetch(first);
          if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
          imageBuffer = Buffer.from(await res.arrayBuffer());
        } else if (first instanceof ReadableStream) {
          const reader = first.getReader();
          const chunks: Uint8Array[] = [];
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
          }
          imageBuffer = Buffer.concat(chunks);
        } else {
          imageBuffer = Buffer.from(first as any);
        }
      } else if (output instanceof ReadableStream) {
        const reader = output.getReader();
        const chunks: Uint8Array[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        imageBuffer = Buffer.concat(chunks);
      } else {
        throw new Error(`Unexpected Replicate output type: ${typeof output}`);
      }

      console.log(`[agentBuild] Got grid image (${imageBuffer.length} bytes)`);

      // 3. Split into 4 views using jimp
      const img = await Jimp.read(imageBuffer);
      const w = img.width;
      const h = img.height;
      const halfW = Math.floor(w / 2);
      const halfH = Math.floor(h / 2);

      const crops = [
        { x: 0, y: 0, w: halfW, h: halfH },         // front
        { x: halfW, y: 0, w: halfW, h: halfH },      // right
        { x: 0, y: halfH, w: halfW, h: halfH },      // back
        { x: halfW, y: halfH, w: halfW, h: halfH },  // left
      ];

      const viewBase64: string[] = [];
      for (const crop of crops) {
        const view = img.clone().crop({ x: crop.x, y: crop.y, w: crop.w, h: crop.h });
        const buf = await view.getBuffer("image/png");
        viewBase64.push(`data:image/png;base64,${Buffer.from(buf).toString("base64")}`);
      }

      // 4. Upload grid to storage
      const blob = new Blob([new Uint8Array(imageBuffer)], { type: "image/png" });
      const storageId = await ctx.storage.store(blob);
      const gridUrl = await ctx.storage.getUrl(storageId);

      // 5. Call Claude Opus 4 via Bedrock for geometry code
      console.log(`[agentBuild] Calling Claude Opus 4.6 (Bedrock) for geometry code...`);

      const geometryPrompt = `You are an expert Three.js developer. I'm showing you reference views of a building described as "${buildDescription}" (front, right, back, left elevations).

Generate JavaScript code that creates a THREE.Group representing this building using procedural geometry.

REQUIREMENTS:
- The building sits on a 24×24 unit plot. XZ footprint must stay within 24×24.
- HEIGHT MUST MATCH REAL-WORLD SCALE (1 unit ≈ 1 meter):
  - Small house / cabin / shed: 5–10 units
  - Regular house / villa: 8–15 units
  - Townhouse / small apartment: 15–25 units
  - Mid-rise: 30–60 units
  - Skyscraper: 80–150 units
- Return ONLY a JavaScript function body that will be wrapped in: function(THREE) { ... return group; }
- Create a THREE.Group as the root
- Use THREE.MeshStandardMaterial with side: THREE.DoubleSide on every material
- NO texture loading, NO external files
- Center at origin (0,0,0) on XZ, base at Y=0

TEXTURE ANNOTATIONS:
Set mesh.userData.textureId to one of: "glass-curtainwall", "concrete-smooth", "concrete-exposed", "stone-ashlar", "steel-panel", "brick-red", "brick-white", "wood-siding", "stucco-white", "roof-tiles"

\`\`\`javascript
const group = new THREE.Group();
// ... geometry code ...
return group;
\`\`\`

Generate the code now for "${buildDescription}".`;

      // Build Bedrock content array with 4 view images + prompt
      const bedrockContent: Array<Record<string, unknown>> = [];
      for (const b64 of viewBase64) {
        // Strip data URI prefix to get raw base64
        const raw = b64.replace(/^data:image\/\w+;base64,/, "");
        bedrockContent.push({
          type: "image",
          source: { type: "base64", media_type: "image/png", data: raw },
        });
      }
      bedrockContent.push({ type: "text", text: geometryPrompt });

      const bedrockClient = new BedrockRuntimeClient({
        region: process.env.AWS_DEFAULT_REGION || "us-west-2",
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
          sessionToken: process.env.AWS_SESSION_TOKEN,
        },
      });

      const bedrockBody = JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 16384,
        messages: [{ role: "user", content: bedrockContent }],
      });

      const bedrockCommand = new InvokeModelCommand({
        modelId: "us.anthropic.claude-opus-4-6-v1",
        contentType: "application/json",
        body: new TextEncoder().encode(bedrockBody),
      });

      const bedrockResponse = await bedrockClient.send(bedrockCommand);
      const bedrockResult = JSON.parse(new TextDecoder().decode(bedrockResponse.body));
      const text: string | undefined = bedrockResult.content?.[0]?.text;
      if (!text) throw new Error("Bedrock Opus 4 returned no content");

      const codeMatch = text.match(/```(?:javascript|js)?\s*\n([\s\S]*?)```/);
      const code = codeMatch ? codeMatch[1].trim() : text.trim();
      if (!code) throw new Error("LLM returned no usable geometry code");
      console.log(`[agentBuild] Got geometry code (${code.length} chars)`);

      // 5.5. Evaluate + optionally improve (non-fatal — use raw code on failure)
      let evaluatedCode = code;
      try {
        evaluatedCode = await evaluateAndImprove(code, buildDescription);
      } catch (evalErr) {
        console.warn(`[agentBuild] Eval/improve failed, using raw code:`, evalErr);
      }

      // 6. Create building
      await ctx.runMutation(internal.buildings.createBuildingInternal, {
        plotIndex,
        ownerId: `agent:${agentName}`,
        prompt: buildDescription,
        proceduralCode: evaluatedCode,
        multiViewGrid: gridUrl ?? undefined,
        createdAtTick: tickNumber,
      });

      // 7. Mark plot back to claimed (not occupied) so more buildings can be added
      // Plots support up to 8 buildings in a perimeter grid layout
      await ctx.runMutation(internal.plots.resetPlotInternal, { plotIndex });

      // 8. Update simulation state: decrement active build count, set agent's category
      await ctx.runMutation(internal.simulation._simBuildHelpers.onBuildComplete, {
        plotIndex,
        category,
        agentName,
      });

      console.log(`[agentBuild] "${buildDescription}" complete on plot #${plotIndex}!`);
    } catch (err) {
      console.error(`[agentBuild] Error:`, err);
      try {
        await ctx.runMutation(internal.plots.resetPlotInternal, { plotIndex });
        await ctx.runMutation(internal.simulation._simBuildHelpers.onBuildFailed, {});
      } catch (resetErr) {
        console.error(`[agentBuild] Failed to reset:`, resetErr);
      }
    }
  },
});

/**
 * Evaluate generated code quality with Mistral Small (cheap scoring),
 * improve with Bedrock Claude Opus 4.6 if needed.
 * Returns the best code after up to 2 improvement iterations.
 */
async function evaluateAndImprove(
  code: string,
  buildDescription: string,
): Promise<string> {
  const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
  let currentCode = code;

  for (let i = 0; i < 3; i++) {
    // Delay between eval iterations to spread API calls
    if (i > 0) {
      await new Promise((r) => setTimeout(r, 1000));
    }
    const score = await withRetry(
      () => evaluateAgentBuildCode(mistral, currentCode, buildDescription),
      "eval-build",
    );
    console.log(`[agentBuild] Eval iteration ${i + 1}: score ${score}/10`);

    if (score >= 7.0) {
      console.log(`[agentBuild] Code quality sufficient (${score} >= 7.0), done.`);
      return currentCode;
    }

    console.log(`[agentBuild] Score ${score} < 7.0, improving via Bedrock Claude Opus 4.6...`);
    currentCode = await improveAgentBuildCode(currentCode, buildDescription, score);
  }

  return currentCode;
}

async function evaluateAgentBuildCode(
  mistral: Mistral,
  code: string,
  buildDescription: string,
): Promise<number> {
  const prompt = `Score this Three.js procedural building code on a scale of 0-10 for a "${buildDescription}".

Criteria:
- Architectural accuracy (does it look like the described building?)
- Code correctness (valid Three.js, no errors)
- Visual quality (detail level, proportions, materials)
- Scale appropriateness (reasonable real-world dimensions)

Code:
\`\`\`javascript
${code.slice(0, 3000)}
\`\`\`

Reply with ONLY a JSON object: {"score": N, "reason": "brief explanation"}`;

  try {
    const response = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages: [{ role: "user", content: prompt }],
      maxTokens: 100,
      temperature: 0.3,
    });

    const text = response?.choices?.[0]?.message?.content;
    if (!text || typeof text !== "string") return 5.0;

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return 5.0;

    const parsed = JSON.parse(match[0]);
    const score = Number(parsed.score);
    return isNaN(score) ? 5.0 : Math.max(0, Math.min(10, score));
  } catch {
    return 5.0;
  }
}

async function improveAgentBuildCode(
  code: string,
  buildDescription: string,
  currentScore: number,
): Promise<string> {
  const prompt = `This Three.js building code for a "${buildDescription}" scored ${currentScore}/10.
Improve it to score higher. Focus on:
- Adding architectural details (windows, doors, roof features)
- Fixing proportions and scale
- Better material choices
- More realistic geometry

Current code:
\`\`\`javascript
${code}
\`\`\`

Return ONLY the improved JavaScript function body (no markdown fences, no explanation).
The code must create a THREE.Group and return it.`;

  try {
    const text = await callBedrockText(prompt, 8192);

    const codeMatch = text.match(/```(?:javascript|js)?\s*\n([\s\S]*?)```/);
    const improved = codeMatch ? codeMatch[1].trim() : text.trim();
    if (!improved || improved.length < 50) return code;

    // Validate: must contain THREE.Group and return statement
    if (!improved.includes("THREE.Group") || !improved.includes("return")) {
      console.warn(`[agentBuild] Improved code missing THREE.Group or return, keeping original`);
      return code;
    }

    console.log(`[agentBuild] Improved code via Bedrock (${improved.length} chars)`);
    return improved;
  } catch (err) {
    console.warn(`[agentBuild] Bedrock improve failed, keeping original:`, err);
    return code;
  }
}

/**
 * Takes existing procedural geometry code and adapts it for a new building description
 * using Bedrock Claude Opus 4.6 (text-only, no images needed).
 */
async function adaptExistingCode(
  proceduralCode: string,
  originalPrompt: string,
  newDescription: string,
): Promise<string> {
  const adaptPrompt = `You have existing Three.js geometry code for a "${originalPrompt}".
Adapt it to create a "${newDescription}" instead.

Make meaningful but contained modifications:
- Adjust proportions (height, width, depth)
- Change material colors/textures where appropriate
- Add or remove small architectural details
- Keep the same general structure as foundation

Return ONLY the modified JavaScript function body (no markdown fences, no explanation).
The code must create a THREE.Group and return it.

Existing code:
\`\`\`javascript
${proceduralCode}
\`\`\``;

  const text = await callBedrockText(adaptPrompt, 8192);

  // Extract code — handle both fenced and raw responses
  const codeMatch = text.match(/```(?:javascript|js)?\s*\n([\s\S]*?)```/);
  const code = codeMatch ? codeMatch[1].trim() : text.trim();
  if (!code) throw new Error("Adaptation returned no usable geometry code");

  // Validate: must contain THREE.Group and return statement
  if (!code.includes("THREE.Group") || !code.includes("return")) {
    console.warn(`[agentBuild] Adapted code missing THREE.Group or return, using original`);
    return proceduralCode;
  }

  console.log(`[agentBuild] Adapted code via Bedrock (${code.length} chars)`);
  return code;
}
