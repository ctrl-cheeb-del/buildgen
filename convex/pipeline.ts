"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import Replicate from "replicate";
import { Mistral } from "@mistralai/mistralai";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { Jimp } from "jimp";

// --- Replicate image generation ---

function getReplicatePrompt(buildingName: string): string {
  return `Create a 2x2 contiguous grid of 4 distinct architectural elevation views of a building described as: "${buildingName}".

- Top-left: Front elevation view
- Top-right: Right side elevation view
- Bottom-left: Rear elevation view
- Bottom-right: Left side elevation view

Each view should:
- Show the full building from ground to top
- Use clean architectural rendering style with sharp details
- Have a plain white background
- Maintain consistent scale and lighting across all 4 views
- Interpret the description as an actual real architectural structure — the building's shape, facade, and silhouette should clearly evoke the described concept
- No people, no cars, no surrounding buildings`;
}

async function fetchReplicateImage(buildingName: string): Promise<Buffer> {
  const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
  });

  const prompt = getReplicatePrompt(buildingName);
  console.log("[Pipeline] Calling Replicate for 2x2 grid...");

  let output: unknown;
  try {
    output = await replicate.run("google/nano-banana-2", {
      input: {
        prompt,
        aspect_ratio: "1:1",
        resolution: "1K",
        output_format: "png",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Replicate model failed: ${msg || "unknown error"}`);
  }

  // Handle the various formats Replicate can return
  if (typeof output === "string") {
    const res = await fetch(output);
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } else if (Array.isArray(output) && output.length > 0) {
    const first = output[0];
    if (typeof first === "string") {
      const res = await fetch(first);
      if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } else if (first && typeof first === "object" && "url" in first) {
      const res = await fetch((first as { url: string }).url);
      if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } else if (
      first instanceof ReadableStream ||
      (first && typeof (first as ReadableStream).getReader === "function")
    ) {
      const reader = (first as ReadableStream).getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      return Buffer.concat(chunks);
    }
  } else if (
    output instanceof ReadableStream ||
    (output && typeof (output as ReadableStream).getReader === "function")
  ) {
    const reader = (output as ReadableStream).getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } else if (output && typeof output === "object" && "url" in output) {
    const res = await fetch((output as { url: string }).url);
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  throw new Error(`Unexpected Replicate output format: ${typeof output}`);
}

// --- Split 2x2 grid into 4 views using jimp ---

interface SplitViews {
  front: string; // base64
  right: string;
  back: string;
  left: string;
}

async function splitGridImage(imageBuffer: Buffer): Promise<SplitViews> {
  const image = await Jimp.read(imageBuffer);
  const width = image.width;
  const height = image.height;
  const halfW = Math.floor(width / 2);
  const halfH = Math.floor(height / 2);

  const positions: Array<{ x: number; y: number; key: keyof SplitViews }> = [
    { x: 0, y: 0, key: "front" },
    { x: halfW, y: 0, key: "right" },
    { x: 0, y: halfH, key: "back" },
    { x: halfW, y: halfH, key: "left" },
  ];

  const results = {} as SplitViews;
  for (const { x, y, key } of positions) {
    const cropped = image.clone().crop({ x, y, w: halfW, h: halfH });
    const buf = await cropped.getBuffer("image/png");
    results[key] = Buffer.from(buf).toString("base64");
  }

  console.log("[Pipeline] Split grid into 4 views");
  return results;
}

// --- LLM provider chain (inline) ---

type LLMProvider = {
  name: string;
  call: (prompt: string, imagesBase64: string[]) => Promise<string>;
};

async function callBedrock(
  modelId: string,
  prompt: string,
  imagesBase64: string[]
): Promise<string> {
  const client = new BedrockRuntimeClient({
    region: process.env.AWS_DEFAULT_REGION || "us-west-2",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      sessionToken: process.env.AWS_SESSION_TOKEN,
    },
  });

  const content: Array<Record<string, unknown>> = [];
  for (const img of imagesBase64) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: img },
    });
  }
  content.push({ type: "text", text: prompt });

  const body = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 16384,
    messages: [{ role: "user", content }],
  });

  const command = new InvokeModelCommand({
    modelId,
    contentType: "application/json",
    body: new TextEncoder().encode(body),
  });

  const response = await client.send(command);
  const result = JSON.parse(new TextDecoder().decode(response.body));
  const text = result.content?.[0]?.text;
  if (!text) throw new Error(`Bedrock ${modelId} returned no content`);
  return text;
}

async function callOpenRouter(
  model: string,
  prompt: string,
  imagesBase64: string[]
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  const content: Array<Record<string, unknown>> = imagesBase64.map((img) => ({
    type: "image_url",
    image_url: { url: `data:image/png;base64,${img}` },
  }));
  content.push({ type: "text", text: prompt });

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter ${model} error ${res.status}: ${body}`);
  }

  const json = await res.json();
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error(`OpenRouter ${model} returned no content`);
  return text;
}

async function callMistralDirect(
  prompt: string,
  imagesBase64: string[]
): Promise<string> {
  const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

  const imageContent = imagesBase64.map((img) => ({
    type: "image_url" as const,
    imageUrl: `data:image/png;base64,${img}`,
  }));

  const response = await mistral.chat.complete({
    model: "mistral-large-latest",
    messages: [
      {
        role: "user",
        content: [...imageContent, { type: "text" as const, text: prompt }],
      },
    ],
  });

  const text = response?.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string")
    throw new Error("Mistral returned no content");
  return text;
}

function getLLMProviders(): LLMProvider[] {
  return [
    {
      name: "Bedrock (Claude Opus 4.6)",
      call: (prompt, imgs) =>
        callBedrock("us.anthropic.claude-opus-4-6-v1", prompt, imgs),
    },
    {
      name: "Bedrock (Claude Opus 4.6 InvokeModel)",
      call: (prompt, imgs) =>
        callBedrock("us.anthropic.claude-opus-4-6-v1", prompt, imgs),
    },
    {
      name: "OpenRouter (Claude Opus 4.6)",
      call: (prompt, imgs) =>
        callOpenRouter("anthropic/claude-opus-4-6", prompt, imgs),
    },
    {
      name: "Mistral (direct)",
      call: (prompt, imgs) => callMistralDirect(prompt, imgs),
    },
    {
      name: "OpenRouter (Mistral Large)",
      call: (prompt, imgs) =>
        callOpenRouter("mistralai/mistral-large-2512", prompt, imgs),
    },
  ];
}

async function callLLMWithFallback(
  prompt: string,
  imagesBase64: string[]
): Promise<string> {
  const providers = getLLMProviders();
  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    try {
      console.log(`[Pipeline/LLM] Trying ${provider.name}...`);
      const result = await provider.call(prompt, imagesBase64);
      console.log(`[Pipeline/LLM] Success with ${provider.name}`);
      return result;
    } catch (err) {
      const isRateLimit =
        err instanceof Error &&
        (err.message.includes("429") ||
          err.message.includes("rate_limit") ||
          err.message.includes("Rate limit"));

      console.error(
        `[Pipeline/LLM] ${provider.name} failed:`,
        err instanceof Error ? err.message : err
      );

      if (!isRateLimit || i === providers.length - 1) throw err;
      console.log(`[Pipeline/LLM] Rate limited, falling back...`);
    }
  }
  throw new Error("All providers exhausted");
}

// --- Geometry prompt ---

function getGeometryPrompt(buildingName: string): string {
  return `You are an expert Three.js developer. I'm showing you reference views of a building described as "${buildingName}" (front, right, back, left elevations).

Generate JavaScript code that creates a THREE.Group representing this building using procedural geometry.

IMPORTANT: The description may be creative or fantastical (e.g. "a beaver-shaped building", "a mushroom tower", "a building that looks like a guitar"). Study the reference images carefully and recreate the unique shape, silhouette, and features you see. The 3D model should clearly look like the subject described — capture its distinctive outline, proportions, and character.

REQUIREMENTS:
- CRITICAL: Use 1 unit = 1 meter. The plot is 50×50 max. Use realistic footprints — do NOT fill the plot:
  FOOTPRINT (width × depth):
  - Small house / cabin / shed: ~5×4
  - Regular house / villa: ~8×6
  - Pub / shop / small restaurant: ~8×6
  - Church / temple: ~10×18
  - Townhouse: ~4×8
  - Mansion / estate: ~15×12
  - Mid-rise office / apartment block: ~15×12
  - Tall office tower / skyscraper: ~20×20
  - Supertall skyscraper: ~30×30 at base
  - Stadium / arena: ~40×30
  - Bridge: ~40×8 (long but narrow)
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
- IMPORTANT: Use THREE.MeshStandardMaterial (NOT MeshPhysicalMaterial). Do NOT set side: THREE.DoubleSide.
- NO texture loading, NO external files
- Build the model centered at origin (0,0,0) on XZ, with the base at Y=0 (Y-up)
- Maximum footprint: ±25 on X and ±25 on Z (50×50 hard limit). Most buildings should be MUCH smaller than this.
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

const baseMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, });
const baseGeo = new THREE.BoxGeometry(20, 50, 20);
const base = new THREE.Mesh(baseGeo, baseMat);
base.userData.textureId = "concrete-smooth";
base.position.y = 25;
group.add(base);

const glassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, metalness: 0.5, roughness: 0.1, });
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

// --- Main action ---

export const generateBuilding = action({
  args: {
    plotIndex: v.number(),
    buildingName: v.string(),
  },
  handler: async (ctx, { plotIndex, buildingName }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");
    const ownerId = identity.subject;

    // 1. Mark plot as generating
    await ctx.runMutation(internal.plots.markGeneratingInternal, { plotIndex });

    try {
      // 1.5. Check for similar existing buildings to reuse
      const similar = await ctx.runQuery(internal.buildings.searchSimilarBuildings, {
        searchTerm: buildingName,
      });

      if (similar) {
        console.log(`[Pipeline] Found similar building "${similar.prompt}", adapting...`);
        await ctx.runMutation(internal.plots.setPipelineStepInternal, {
          plotIndex,
          step: "generating-code",
        });

        let finalCode: string;
        try {
          finalCode = await adaptExistingCode(
            similar.proceduralCode,
            similar.prompt,
            buildingName,
          );
        } catch (adaptErr) {
          console.warn(
            `[Pipeline] Adaptation failed, falling back to original building code:`,
            adaptErr instanceof Error ? adaptErr.message : adaptErr,
          );
          finalCode = similar.proceduralCode;
        }

        await ctx.runMutation(internal.plots.setPipelineStepInternal, {
          plotIndex,
          step: "placing",
        });

        await ctx.runMutation(internal.buildings.createBuildingInternal, {
          plotIndex,
          ownerId,
          prompt: buildingName,
          proceduralCode: finalCode,
          multiViewGrid: undefined,
        });

        await ctx.runMutation(internal.plots.markOccupiedInternal, { plotIndex });
        console.log(`[Pipeline] Building "${buildingName}" (adapted) complete!`);
        return;
      }

      // 2. Generate multi-view grid image via Replicate
      await ctx.runMutation(internal.plots.setPipelineStepInternal, {
        plotIndex,
        step: "generating-views",
      });
      console.log(`[Pipeline] Generating views for "${buildingName}"...`);
      const imageBuffer = await fetchReplicateImage(buildingName);
      console.log(
        `[Pipeline] Got grid image (${imageBuffer.length} bytes)`
      );

      // 3. Split grid into 4 individual views
      const views = await splitGridImage(imageBuffer);

      // 4. Upload grid image to Convex storage
      const blob = new Blob([new Uint8Array(imageBuffer)], { type: "image/png" });
      const storageId = await ctx.storage.store(blob);
      const gridUrl = await ctx.storage.getUrl(storageId);
      console.log("[Pipeline] Uploaded grid image to storage");

      await ctx.runMutation(internal.plots.setPipelineStepInternal, {
        plotIndex,
        step: "generating-code",
        multiViewUrl: gridUrl ?? undefined,
      });

      // 5. Call LLM for geometry code with 4 separate view images
      const imagesBase64 = [views.front, views.right, views.back, views.left];
      const geometryPrompt = getGeometryPrompt(buildingName);
      console.log("[Pipeline] Calling LLM for geometry code...");
      const llmResponse = await callLLMWithFallback(
        geometryPrompt,
        imagesBase64
      );

      // 5. Extract code block
      const codeMatch = llmResponse.match(
        /```(?:javascript|js)?\s*\n([\s\S]*?)```/
      );
      const code = codeMatch ? codeMatch[1].trim() : llmResponse.trim();
      if (!code) throw new Error("LLM returned no usable geometry code");
      console.log(`[Pipeline] Got geometry code (${code.length} chars)`);

      await ctx.runMutation(internal.plots.setPipelineStepInternal, {
        plotIndex,
        step: "placing",
      });

      // 6. Create building
      await ctx.runMutation(internal.buildings.createBuildingInternal, {
        plotIndex,
        ownerId,
        prompt: buildingName,
        proceduralCode: code,
        multiViewGrid: gridUrl ?? undefined,
      });

      // 7. Mark plot as occupied
      await ctx.runMutation(internal.plots.markOccupiedInternal, { plotIndex });

      console.log(`[Pipeline] Building "${buildingName}" complete!`);
    } catch (err) {
      console.error("[Pipeline] Error:", err);
      // Reset plot so it's not stuck at "generating"
      try {
        await ctx.runMutation(internal.plots.resetPlotInternal, { plotIndex });
      } catch (resetErr) {
        console.error("[Pipeline] Failed to reset plot:", resetErr);
      }
      throw err;
    }
  },
});

/**
 * Takes existing procedural geometry code and adapts it for a new building description
 * using a lightweight LLM call (Sonnet instead of Opus).
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

  const text = await callMistralDirect(adaptPrompt, []);

  // Extract code — handle both fenced and raw responses
  const codeMatch = text.match(/```(?:javascript|js)?\s*\n([\s\S]*?)```/);
  const code = codeMatch ? codeMatch[1].trim() : text.trim();
  if (!code) throw new Error("Adaptation returned no usable geometry code");

  console.log(`[Pipeline] Adapted code (${code.length} chars)`);
  return code;
}
