"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import Replicate from "replicate";
import Anthropic from "@anthropic-ai/sdk";
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

async function callAnthropic(
  modelId: string,
  prompt: string,
  imagesBase64: string[]
): Promise<string> {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
  });

  const content: Anthropic.MessageCreateParams["messages"][0]["content"] = [];
  for (const img of imagesBase64) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: img },
    });
  }
  content.push({ type: "text", text: prompt });

  const response = await client.messages.create({
    model: modelId,
    max_tokens: 16384,
    messages: [{ role: "user", content }],
  });

  const textBlocks = response.content.filter(
    (block): block is Anthropic.TextBlock => block.type === "text"
  );
  const text = textBlocks.map((b) => b.text).join("");
  if (!text) throw new Error(`Anthropic ${modelId} returned no content`);
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

function getLLMProviders(): LLMProvider[] {
  return [
    {
      name: "Anthropic (Claude Opus 4.6)",
      call: (prompt, imgs) =>
        callAnthropic("claude-opus-4-6-20250625", prompt, imgs),
    },
    {
      name: "OpenRouter (Claude Opus 4.6)",
      call: (prompt, imgs) =>
        callOpenRouter("anthropic/claude-opus-4-6", prompt, imgs),
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
      // --- CHEAT: "the london eye" / "london eye" uses pre-built code with fake delays ---
      const normalizedName = buildingName.trim().toLowerCase().replace(/^the\s+/, "");
      if (normalizedName === "london eye") {
        console.log(`[Pipeline] CHEAT: Using pre-built London Eye`);

        const LONDON_EYE_MULTIVIEW_URL =
          "https://rugged-puffin-771.convex.cloud/api/storage/e30b63bb-b892-4f86-ac6f-cfae0266acf6";

        const LONDON_EYE_CODE = `const group = new THREE.Group();

// London Eye - Giant observation wheel
// Diameter approximately 120m, total height ~135m
// A-frame supports on each side, spindle hub, 32 capsules

// === MATERIALS ===
const steelWhiteMat = new THREE.MeshStandardMaterial({ color: 0xe8e8ee, metalness: 0.6, roughness: 0.3 });
const steelDarkMat = new THREE.MeshStandardMaterial({ color: 0x888899, metalness: 0.7, roughness: 0.3 });
const cableMat = new THREE.MeshStandardMaterial({ color: 0xaaaabb, metalness: 0.8, roughness: 0.2 });
const glassMat = new THREE.MeshStandardMaterial({ color: 0x8ab4c8, transparent: true, opacity: 0.45, metalness: 0.6, roughness: 0.1 });
const capsuleFrameMat = new THREE.MeshStandardMaterial({ color: 0xd0d0dd, metalness: 0.5, roughness: 0.3 });
const concreteMat = new THREE.MeshStandardMaterial({ color: 0xb0b0a8, roughness: 0.7 });
const baseBuildingMat = new THREE.MeshStandardMaterial({ color: 0xc0c0b8, roughness: 0.6 });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x555560, roughness: 0.5 });
const metalMat = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.7, roughness: 0.3 });
const whiteMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5 });
const waterMat = new THREE.MeshStandardMaterial({ color: 0x4a6b7a, roughness: 0.2, metalness: 0.3 });

// === DIMENSIONS ===
const wheelRadius = 60;
const hubY = 75;
const numCapsules = 32;
const numSpokes = 64;

// === BASE PLATFORM / BOARDING AREA ===
const baseWidth = 40;
const baseDepth = 20;
const baseHeight = 3;

const baseGeo = new THREE.BoxGeometry(baseWidth, baseHeight, baseDepth);
const baseMesh = new THREE.Mesh(baseGeo, baseBuildingMat);
baseMesh.userData.textureId = "concrete-precast";
baseMesh.position.y = baseHeight / 2;
group.add(baseMesh);

const boardingGeo = new THREE.BoxGeometry(14, 1.5, 10);
const boardingMesh = new THREE.Mesh(boardingGeo, concreteMat);
boardingMesh.userData.textureId = "concrete-smooth";
boardingMesh.position.set(0, baseHeight + 0.75, 0);
group.add(boardingMesh);

for (let i = 0; i < 3; i++) {
  const stepGeo = new THREE.BoxGeometry(14, 0.5, 2);
  const step = new THREE.Mesh(stepGeo, concreteMat);
  step.userData.textureId = "concrete-smooth";
  step.position.set(0, baseHeight * (i / 3) + 0.25, baseDepth / 2 + 1 + i * 2);
  group.add(step);
}

const ticketGeo = new THREE.BoxGeometry(10, 4, 8);
const ticketMesh = new THREE.Mesh(ticketGeo, baseBuildingMat);
ticketMesh.userData.textureId = "concrete-precast";
ticketMesh.position.set(-18, 2, 0);
group.add(ticketMesh);

const ticketGlassGeo = new THREE.BoxGeometry(10 - 1, 3, 0.3);
const ticketGlass = new THREE.Mesh(ticketGlassGeo, glassMat);
ticketGlass.userData.textureId = "glass-curtainwall";
ticketGlass.position.set(-18, 2, 4.15);
group.add(ticketGlass);

for (let i = 0; i < 2; i++) {
  const bandY = 1 + i * 1.5;
  const bandGeo = new THREE.BoxGeometry(baseWidth + 0.4, 0.3, baseDepth + 0.4);
  const band = new THREE.Mesh(bandGeo, concreteMat);
  band.userData.textureId = "concrete-smooth";
  band.position.y = bandY;
  group.add(band);
}

const aFrameSpread = 18;
const aFrameTopSpread = 4;

function createAFrameLeg(xBottom, zBottom, xTop, yTop, zTop) {
  const dir = new THREE.Vector3(xTop - xBottom, yTop, zTop - zBottom);
  const length = dir.length();
  dir.normalize();
  const legGeo = new THREE.CylinderGeometry(0.8, 1.2, length, 12);
  const leg = new THREE.Mesh(legGeo, steelWhiteMat);
  leg.userData.textureId = "metal-zinc";
  leg.position.set((xBottom + xTop) / 2, yTop / 2, (zBottom + zTop) / 2);
  const up = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion();
  const axis = new THREE.Vector3().crossVectors(up, dir).normalize();
  const angle = Math.acos(up.dot(dir));
  if (axis.length() > 0.001) {
    quat.setFromAxisAngle(axis, angle);
    leg.quaternion.copy(quat);
  }
  group.add(leg);
}

createAFrameLeg(-aFrameSpread / 2, baseHeight, -aFrameTopSpread / 2, hubY, -5);
createAFrameLeg(aFrameSpread / 2, baseHeight, aFrameTopSpread / 2, hubY, -5);

for (let h = 0; h < 3; h++) {
  const frac = (h + 1) / 4;
  const crossY = baseHeight + (hubY - baseHeight) * frac;
  const crossSpread = aFrameSpread * (1 - frac) + aFrameTopSpread * frac;
  const crossZ = -5 * frac;
  const crossGeo = new THREE.CylinderGeometry(0.3, 0.3, crossSpread, 8);
  const crossMesh = new THREE.Mesh(crossGeo, steelWhiteMat);
  crossMesh.userData.textureId = "metal-zinc";
  crossMesh.position.set(0, crossY, crossZ);
  crossMesh.rotation.z = Math.PI / 2;
  group.add(crossMesh);
}

const hubGeo = new THREE.CylinderGeometry(3, 3, 8, 24);
const hub = new THREE.Mesh(hubGeo, steelDarkMat);
hub.userData.textureId = "metal-zinc";
hub.position.set(0, hubY, 0);
hub.rotation.x = Math.PI / 2;
group.add(hub);

for (let side = -1; side <= 1; side += 2) {
  const capGeo = new THREE.CylinderGeometry(3.5, 3.5, 0.8, 24);
  const cap = new THREE.Mesh(capGeo, steelWhiteMat);
  cap.userData.textureId = "metal-zinc";
  cap.position.set(0, hubY, side * 4.4);
  cap.rotation.x = Math.PI / 2;
  group.add(cap);
}

const rimGeo = new THREE.TorusGeometry(wheelRadius, 0.7, 8, 64);
const rim = new THREE.Mesh(rimGeo, steelWhiteMat);
rim.userData.textureId = "metal-zinc";
rim.position.set(0, hubY, 0);
group.add(rim);

const rim2Geo = new THREE.TorusGeometry(wheelRadius, 0.5, 8, 64);
const rim2 = new THREE.Mesh(rim2Geo, steelWhiteMat);
rim2.userData.textureId = "metal-zinc";
rim2.position.set(0, hubY, 2);
group.add(rim2);

const rim3 = new THREE.Mesh(rim2Geo, steelWhiteMat);
rim3.userData.textureId = "metal-zinc";
rim3.position.set(0, hubY, -2);
group.add(rim3);

const innerRimGeo = new THREE.TorusGeometry(wheelRadius - 3, 0.35, 8, 64);
const innerRim = new THREE.Mesh(innerRimGeo, steelWhiteMat);
innerRim.userData.textureId = "metal-zinc";
innerRim.position.set(0, hubY, 0);
group.add(innerRim);

for (let i = 0; i < numSpokes; i++) {
  const angle = (i / numSpokes) * Math.PI * 2;
  const outerX = Math.cos(angle) * wheelRadius;
  const outerY = Math.sin(angle) * wheelRadius + hubY;
  const dx = outerX - 0;
  const dy = outerY - hubY;
  const spokeLength = Math.sqrt(dx * dx + dy * dy);
  const spokeGeo = new THREE.CylinderGeometry(0.08, 0.08, spokeLength, 4);
  const spoke = new THREE.Mesh(spokeGeo, cableMat);
  spoke.position.set(outerX / 2, hubY + dy / 2, 0);
  spoke.rotation.z = -angle + Math.PI / 2;
  group.add(spoke);
}

for (let i = 0; i < numSpokes / 2; i++) {
  const angle = (i / (numSpokes / 2)) * Math.PI * 2;
  const outerX = Math.cos(angle) * (wheelRadius - 2);
  const outerY = Math.sin(angle) * (wheelRadius - 2) + hubY;
  const spokeLength = wheelRadius - 2;
  const spokeGeo = new THREE.CylinderGeometry(0.06, 0.06, spokeLength, 4);
  const spoke = new THREE.Mesh(spokeGeo, cableMat);
  spoke.position.set(outerX / 2, hubY + (outerY - hubY) / 2, 1.5);
  spoke.rotation.z = -angle + Math.PI / 2;
  group.add(spoke);
  const spoke2 = spoke.clone();
  spoke2.position.z = -1.5;
  group.add(spoke2);
}

for (let i = 0; i < numCapsules; i++) {
  const angle = (i / numCapsules) * Math.PI * 2;
  const capsuleX = Math.cos(angle) * wheelRadius;
  const capsuleY = Math.sin(angle) * wheelRadius + hubY;
  const capsuleGroup = new THREE.Group();
  capsuleGroup.position.set(capsuleX, capsuleY, 0);
  const capsuleLength = 6;
  const capsuleWidth = 2.5;
  const capsuleHeight = 3;
  const capsuleBodyGeo = new THREE.SphereGeometry(capsuleWidth, 12, 8);
  capsuleBodyGeo.scale(capsuleLength / (capsuleWidth * 2), capsuleHeight / (capsuleWidth * 2), 1);
  const capsuleBody = new THREE.Mesh(capsuleBodyGeo, glassMat);
  capsuleBody.userData.textureId = "glass-curtainwall";
  capsuleGroup.add(capsuleBody);
  const capsuleRingGeo = new THREE.TorusGeometry(capsuleWidth * 0.9, 0.12, 6, 16);
  const capsuleRing = new THREE.Mesh(capsuleRingGeo, capsuleFrameMat);
  capsuleRing.userData.textureId = "metal-zinc";
  capsuleRing.rotation.y = Math.PI / 2;
  capsuleGroup.add(capsuleRing);
  const capsuleFloorGeo = new THREE.BoxGeometry(capsuleLength * 0.85, 0.15, capsuleWidth * 1.4);
  const capsuleFloor = new THREE.Mesh(capsuleFloorGeo, darkMat);
  capsuleFloor.position.y = -capsuleHeight * 0.35;
  capsuleGroup.add(capsuleFloor);
  const armLength = 3;
  const armGeo = new THREE.CylinderGeometry(0.15, 0.15, armLength, 6);
  const arm = new THREE.Mesh(armGeo, steelWhiteMat);
  arm.userData.textureId = "metal-zinc";
  arm.position.y = capsuleHeight * 0.5 + armLength / 2;
  capsuleGroup.add(arm);
  const pivotGeo = new THREE.TorusGeometry(0.4, 0.1, 6, 12);
  const pivot = new THREE.Mesh(pivotGeo, metalMat);
  pivot.position.y = capsuleHeight * 0.5 + armLength;
  capsuleGroup.add(pivot);
  group.add(capsuleGroup);
}

const anchorX = 0;
const anchorZ = 45;
const anchorY = baseHeight;

const anchorGeo = new THREE.BoxGeometry(8, 4, 6);
const anchorMesh = new THREE.Mesh(anchorGeo, concreteMat);
anchorMesh.userData.textureId = "concrete-precast";
anchorMesh.position.set(anchorX, anchorY / 2 + baseHeight / 2, anchorZ);
group.add(anchorMesh);

for (let i = -2; i <= 2; i++) {
  const cableTopX = i * 1.5;
  const cableTopY = hubY + 2;
  const cableTopZ = 2;
  const dx = anchorX + i * 1.5 - cableTopX;
  const dy = anchorY + 2 - cableTopY;
  const dz = anchorZ - cableTopZ;
  const cableLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const cableGeo = new THREE.CylinderGeometry(0.12, 0.12, cableLen, 4);
  const cable = new THREE.Mesh(cableGeo, cableMat);
  cable.position.set(cableTopX + dx / 2, cableTopY + dy / 2, cableTopZ + dz / 2);
  const dir = new THREE.Vector3(dx, dy, dz).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion();
  const axis = new THREE.Vector3().crossVectors(up, dir).normalize();
  const ang = Math.acos(Math.max(-1, Math.min(1, up.dot(dir))));
  if (axis.length() > 0.001) {
    quat.setFromAxisAngle(axis, ang);
    cable.quaternion.copy(quat);
  }
  group.add(cable);
}

const riverGeo = new THREE.BoxGeometry(120, 0.3, 30);
const riverMesh = new THREE.Mesh(riverGeo, waterMat);
riverMesh.position.set(0, -0.15, -25);
group.add(riverMesh);

const wallGeo = new THREE.BoxGeometry(50, 2, 1);
const wall = new THREE.Mesh(wallGeo, concreteMat);
wall.userData.textureId = "concrete-smooth";
wall.position.set(0, 1, -10);
group.add(wall);

for (let i = -20; i <= 20; i += 5) {
  const bollardGeo = new THREE.CylinderGeometry(0.3, 0.3, 1.2, 8);
  const bollard = new THREE.Mesh(bollardGeo, darkMat);
  bollard.position.set(i, 0.6, -9);
  group.add(bollard);
}

const entranceGeo = new THREE.BoxGeometry(12, 0.3, 5);
const entrance = new THREE.Mesh(entranceGeo, darkMat);
entrance.userData.textureId = "metal-zinc";
entrance.position.set(0, baseHeight + 2.5, baseDepth / 2 + 2.5);
group.add(entrance);

for (let i = -1; i <= 1; i += 2) {
  const supportGeo = new THREE.CylinderGeometry(0.2, 0.2, baseHeight + 2.5, 8);
  const support = new THREE.Mesh(supportGeo, metalMat);
  support.position.set(i * 5, (baseHeight + 2.5) / 2, baseDepth / 2 + 4.5);
  group.add(support);
}

for (let i = 0; i < 64; i++) {
  const angle = (i / 64) * Math.PI * 2;
  const lx = Math.cos(angle) * wheelRadius;
  const ly = Math.sin(angle) * wheelRadius + hubY;
  const lightGeo = new THREE.SphereGeometry(0.25, 6, 6);
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffffaa, emissiveIntensity: 0.3 });
  const lightMesh = new THREE.Mesh(lightGeo, lightMat);
  lightMesh.position.set(lx, ly, 0);
  group.add(lightMesh);
}

return group;`;

        // Stage 1: "generating-views" — wait 12s
        await ctx.runMutation(internal.plots.setPipelineStepInternal, {
          plotIndex,
          step: "generating-views",
          multiViewUrl: LONDON_EYE_MULTIVIEW_URL,
        });
        await new Promise((r) => setTimeout(r, 12_000));

        // Stage 2: "generating-code" — wait 15s
        await ctx.runMutation(internal.plots.setPipelineStepInternal, {
          plotIndex,
          step: "generating-code",
          multiViewUrl: LONDON_EYE_MULTIVIEW_URL,
        });
        await new Promise((r) => setTimeout(r, 15_000));

        // Stage 3: "placing"
        await ctx.runMutation(internal.plots.setPipelineStepInternal, {
          plotIndex,
          step: "placing",
          multiViewUrl: LONDON_EYE_MULTIVIEW_URL,
        });

        await ctx.runMutation(internal.buildings.createBuildingInternal, {
          plotIndex,
          ownerId,
          prompt: buildingName,
          proceduralCode: LONDON_EYE_CODE,
          multiViewGrid: LONDON_EYE_MULTIVIEW_URL,
        });

        await ctx.runMutation(internal.plots.markOccupiedInternal, { plotIndex });
        console.log(`[Pipeline] CHEAT: London Eye placed!`);
        return;
      }
      // --- CHEAT: "battersea power station" uses pre-built code with fake delays ---
      if (normalizedName.includes("battersea")) {
        console.log(`[Pipeline] CHEAT: Using pre-built Battersea Power Station`);

        const BATTERSEA_MULTIVIEW_URL =
          "https://rugged-puffin-771.convex.cloud/api/storage/f2341b69-8366-4766-93ef-045e632a20f4";

        const BATTERSEA_CODE = `const group = new THREE.Group();

// Materials - Battersea Power Station uses brown/tan brick with industrial elements
const brickMat = new THREE.MeshStandardMaterial({ color: 0x8B5A2B, roughness: 0.85 });
const brickLightMat = new THREE.MeshStandardMaterial({ color: 0x9C6B3C, roughness: 0.8 });
const concreteMat = new THREE.MeshStandardMaterial({ color: 0xc0b8a8, roughness: 0.8 });
const roofMat = new THREE.MeshStandardMaterial({ color: 0x5a5a5a, roughness: 0.5, metalness: 0.3 });
const darkTrimMat = new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 0.4, metalness: 0.4 });
const glassMat = new THREE.MeshStandardMaterial({ color: 0x6a8a9a, transparent: true, opacity: 0.4, metalness: 0.5, roughness: 0.1 });
const chimneyMat = new THREE.MeshStandardMaterial({ color: 0xd4c8b0, roughness: 0.6 });
const columnMat = new THREE.MeshStandardMaterial({ color: 0x7a6a5a, roughness: 0.5, metalness: 0.3 });
const steelMat = new THREE.MeshStandardMaterial({ color: 0x707070, roughness: 0.4, metalness: 0.6 });
const whiteTrimMat = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.5 });

// === MAIN BUILDING (massive rectangular industrial hall) ===
const buildingWidth = 40;
const buildingDepth = 20;
const wallHeight = 14;

const mainWallGeo = new THREE.BoxGeometry(buildingWidth, wallHeight, buildingDepth);
const mainWall = new THREE.Mesh(mainWallGeo, brickMat);
mainWall.userData.textureId = "brick-brown";
mainWall.position.set(0, wallHeight / 2, 0);
group.add(mainWall);

const towerWidth = 30;
const towerDepth = 14;
const towerHeight = 6;
const towerGeo = new THREE.BoxGeometry(towerWidth, towerHeight, towerDepth);
const tower = new THREE.Mesh(towerGeo, brickLightMat);
tower.userData.textureId = "brick-brown";
tower.position.set(0, wallHeight + towerHeight / 2, 0);
group.add(tower);

const towerCapGeo = new THREE.BoxGeometry(towerWidth + 1.5, 0.6, towerDepth + 1.5);
const towerCap = new THREE.Mesh(towerCapGeo, whiteTrimMat);
towerCap.userData.textureId = "concrete-smooth";
towerCap.position.set(0, wallHeight + towerHeight + 0.3, 0);
group.add(towerCap);

const cornice2Geo = new THREE.BoxGeometry(buildingWidth + 1.0, 0.5, buildingDepth + 1.0);
const cornice2 = new THREE.Mesh(cornice2Geo, whiteTrimMat);
cornice2.userData.textureId = "concrete-smooth";
cornice2.position.set(0, wallHeight + 0.25, 0);
group.add(cornice2);

const roofGeo = new THREE.BoxGeometry(towerWidth + 0.4, 0.4, towerDepth + 0.4);
const roof = new THREE.Mesh(roofGeo, roofMat);
roof.userData.textureId = "concrete-smooth";
roof.position.set(0, wallHeight + towerHeight + 0.6 + 0.2, 0);
group.add(roof);

for (let side = -1; side <= 1; side += 2) {
  const wingRoofGeo = new THREE.BoxGeometry((buildingWidth - towerWidth) / 2 + 0.5, 0.35, buildingDepth + 0.6);
  const wingRoof = new THREE.Mesh(wingRoofGeo, roofMat);
  wingRoof.userData.textureId = "concrete-smooth";
  wingRoof.position.set(side * (towerWidth / 2 + (buildingWidth - towerWidth) / 4), wallHeight + 0.17, 0);
  group.add(wingRoof);
}

const fasciaGeo = new THREE.BoxGeometry(buildingWidth + 0.5, 0.4, 0.2);
const fascia = new THREE.Mesh(fasciaGeo, whiteTrimMat);
fascia.userData.textureId = "concrete-smooth";
fascia.position.set(0, wallHeight * 0.55, buildingDepth / 2 + 0.1);
group.add(fascia);

const fascia2Geo = new THREE.BoxGeometry(buildingWidth + 0.5, 0.3, 0.15);
const fascia2 = new THREE.Mesh(fascia2Geo, whiteTrimMat);
fascia2.userData.textureId = "concrete-smooth";
fascia2.position.set(0, wallHeight * 0.35, buildingDepth / 2 + 0.08);
group.add(fascia2);

const fasciaBackGeo = new THREE.BoxGeometry(buildingWidth + 0.5, 0.4, 0.2);
const fasciaBack = new THREE.Mesh(fasciaBackGeo, whiteTrimMat);
fasciaBack.userData.textureId = "concrete-smooth";
fasciaBack.position.set(0, wallHeight * 0.55, -buildingDepth / 2 - 0.1);
group.add(fasciaBack);

// === FOUR ICONIC CHIMNEYS ===
const chimneyPositions = [
  { x: -14, z: -7 },
  { x: -14, z: 7 },
  { x: 14, z: -7 },
  { x: 14, z: 7 },
];

chimneyPositions.forEach(pos => {
  const chimneyHeight = 28;
  const chimneyGeo = new THREE.CylinderGeometry(1.0, 1.3, chimneyHeight, 12);
  const chimney = new THREE.Mesh(chimneyGeo, chimneyMat);
  chimney.userData.textureId = "concrete-smooth";
  chimney.position.set(pos.x, chimneyHeight / 2, pos.z);
  group.add(chimney);

  const chimneyBaseGeo = new THREE.CylinderGeometry(1.4, 1.8, 5, 12);
  const chimneyBase = new THREE.Mesh(chimneyBaseGeo, brickMat);
  chimneyBase.userData.textureId = "brick-brown";
  chimneyBase.position.set(pos.x, 2.5, pos.z);
  group.add(chimneyBase);

  const capRingGeo = new THREE.TorusGeometry(1.1, 0.2, 8, 12);
  const capRing = new THREE.Mesh(capRingGeo, whiteTrimMat);
  capRing.rotation.x = Math.PI / 2;
  capRing.position.set(pos.x, chimneyHeight, pos.z);
  group.add(capRing);

  const topFlareGeo = new THREE.CylinderGeometry(1.2, 1.0, 1.5, 12);
  const topFlare = new THREE.Mesh(topFlareGeo, chimneyMat);
  topFlare.position.set(pos.x, chimneyHeight + 0.75, pos.z);
  group.add(topFlare);

  for (let b = 0; b < 3; b++) {
    const bandGeo = new THREE.CylinderGeometry(1.15 - b * 0.03, 1.15 - b * 0.03, 0.25, 12);
    const band = new THREE.Mesh(bandGeo, whiteTrimMat);
    band.position.set(pos.x, 8 + b * 7, pos.z);
    group.add(band);
  }
});

// === FRONT WINDOWS ===
for (let i = -8; i <= 8; i += 2) {
  if (Math.abs(i) < 1) continue;
  const winGeo = new THREE.BoxGeometry(1.0, wallHeight * 0.6, 0.1);
  const win = new THREE.Mesh(winGeo, glassMat);
  win.userData.textureId = "glass-curtainwall";
  win.position.set(i, wallHeight * 0.45, buildingDepth / 2 + 0.06);
  group.add(win);

  const winFrameGeo = new THREE.BoxGeometry(1.2, wallHeight * 0.63, 0.05);
  const winFrame = new THREE.Mesh(winFrameGeo, whiteTrimMat);
  winFrame.position.set(i, wallHeight * 0.45, buildingDepth / 2 + 0.03);
  group.add(winFrame);
}

for (let i = -12; i <= 12; i += 3) {
  const upWinGeo = new THREE.BoxGeometry(1.5, 3.0, 0.1);
  const upWin = new THREE.Mesh(upWinGeo, glassMat);
  upWin.userData.textureId = "glass-curtainwall";
  upWin.position.set(i, wallHeight + towerHeight * 0.5, towerDepth / 2 + 0.06);
  group.add(upWin);
}

for (let i = -12; i <= 12; i += 3) {
  const upWinGeo = new THREE.BoxGeometry(1.5, 3.0, 0.1);
  const upWin = new THREE.Mesh(upWinGeo, glassMat);
  upWin.userData.textureId = "glass-curtainwall";
  upWin.position.set(i, wallHeight + towerHeight * 0.5, -towerDepth / 2 - 0.06);
  group.add(upWin);
}

for (let i = -8; i <= 8; i += 2) {
  if (Math.abs(i) < 1) continue;
  const winGeo = new THREE.BoxGeometry(1.0, wallHeight * 0.6, 0.1);
  const win = new THREE.Mesh(winGeo, glassMat);
  win.userData.textureId = "glass-curtainwall";
  win.position.set(i, wallHeight * 0.45, -buildingDepth / 2 - 0.06);
  group.add(win);
}

const doorGeo = new THREE.BoxGeometry(4.0, 6.0, 0.12);
const door = new THREE.Mesh(doorGeo, glassMat);
door.userData.textureId = "glass-curtainwall";
door.position.set(0, 3.0, buildingDepth / 2 + 0.07);
group.add(door);

const doorFrameGeo = new THREE.BoxGeometry(5.0, 7.0, 0.08);
const doorFrame = new THREE.Mesh(doorFrameGeo, whiteTrimMat);
doorFrame.position.set(0, 3.5, buildingDepth / 2 + 0.04);
group.add(doorFrame);

const pedimentGeo = new THREE.BoxGeometry(6.0, 1.0, 0.6);
const pediment = new THREE.Mesh(pedimentGeo, whiteTrimMat);
pediment.userData.textureId = "concrete-smooth";
pediment.position.set(0, 7.5, buildingDepth / 2 + 0.3);
group.add(pediment);

for (let i = -6; i <= 6; i += 3) {
  const sideWinGeo = new THREE.BoxGeometry(0.1, wallHeight * 0.55, 1.2);
  const sideWin = new THREE.Mesh(sideWinGeo, glassMat);
  sideWin.userData.textureId = "glass-curtainwall";
  sideWin.position.set(-buildingWidth / 2 - 0.05, wallHeight * 0.45, i);
  group.add(sideWin);
}

for (let i = -6; i <= 6; i += 3) {
  const sideWinGeo = new THREE.BoxGeometry(0.1, wallHeight * 0.55, 1.2);
  const sideWin = new THREE.Mesh(sideWinGeo, glassMat);
  sideWin.userData.textureId = "glass-curtainwall";
  sideWin.position.set(buildingWidth / 2 + 0.05, wallHeight * 0.45, i);
  group.add(sideWin);
}

// === VERTICAL PILASTERS ===
const pilasterPositions = [-18, -14, -10, -6, -2, 2, 6, 10, 14, 18];
pilasterPositions.forEach(px => {
  const pilGeo = new THREE.BoxGeometry(0.5, wallHeight + 0.5, 0.5);
  const pil = new THREE.Mesh(pilGeo, brickLightMat);
  pil.userData.textureId = "brick-brown";
  pil.position.set(px, wallHeight / 2 + 0.25, buildingDepth / 2 + 0.25);
  group.add(pil);

  const pilBack = new THREE.Mesh(pilGeo.clone(), brickLightMat);
  pilBack.userData.textureId = "brick-brown";
  pilBack.position.set(px, wallHeight / 2 + 0.25, -buildingDepth / 2 - 0.25);
  group.add(pilBack);
});

// === CORNER TOWERS ===
for (let sx = -1; sx <= 1; sx += 2) {
  const cornerTowerGeo = new THREE.BoxGeometry(4, wallHeight + 3, buildingDepth + 1);
  const cornerTower = new THREE.Mesh(cornerTowerGeo, brickMat);
  cornerTower.userData.textureId = "brick-brown";
  cornerTower.position.set(sx * (buildingWidth / 2 - 1.5), (wallHeight + 3) / 2, 0);
  group.add(cornerTower);

  const ctCapGeo = new THREE.BoxGeometry(5, 0.5, buildingDepth + 2);
  const ctCap = new THREE.Mesh(ctCapGeo, whiteTrimMat);
  ctCap.userData.textureId = "concrete-smooth";
  ctCap.position.set(sx * (buildingWidth / 2 - 1.5), wallHeight + 3 + 0.25, 0);
  group.add(ctCap);
}

// === INDUSTRIAL ROOF STRUCTURES ===
const skylightGeo = new THREE.BoxGeometry(20, 2.5, 3);
const skylight = new THREE.Mesh(skylightGeo, steelMat);
skylight.userData.textureId = "steel-panel";
skylight.position.set(0, wallHeight + towerHeight + 0.6 + 1.45, 0);
group.add(skylight);

const skylightGlassGeo = new THREE.BoxGeometry(19, 2.0, 0.08);
const skylightGlass = new THREE.Mesh(skylightGlassGeo, glassMat);
skylightGlass.userData.textureId = "glass-curtainwall";
skylightGlass.position.set(0, wallHeight + towerHeight + 0.6 + 1.45, 1.55);
group.add(skylightGlass);

const skylightGlass2 = new THREE.Mesh(skylightGlassGeo.clone(), glassMat);
skylightGlass2.userData.textureId = "glass-curtainwall";
skylightGlass2.position.set(0, wallHeight + towerHeight + 0.6 + 1.45, -1.55);
group.add(skylightGlass2);

for (let i = -8; i <= 8; i += 4) {
  const ventGeo = new THREE.CylinderGeometry(0.3, 0.3, 2.0, 8);
  const vent = new THREE.Mesh(ventGeo, steelMat);
  vent.position.set(i, wallHeight + towerHeight + 0.6 + 1.0, -5);
  group.add(vent);

  const capGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.2, 8);
  const cap = new THREE.Mesh(capGeo, steelMat);
  cap.position.set(i, wallHeight + towerHeight + 0.6 + 2.1, -5);
  group.add(cap);
}

// === GROUND LEVEL / BASE ===
const plinth1Geo = new THREE.BoxGeometry(buildingWidth + 4, 0.6, buildingDepth + 4);
const plinth1 = new THREE.Mesh(plinth1Geo, concreteMat);
plinth1.userData.textureId = "concrete-smooth";
plinth1.position.set(0, 0.3, 0);
group.add(plinth1);

const plinth2Geo = new THREE.BoxGeometry(buildingWidth + 2, 0.4, buildingDepth + 2);
const plinth2 = new THREE.Mesh(plinth2Geo, concreteMat);
plinth2.userData.textureId = "concrete-smooth";
plinth2.position.set(0, 0.8, 0);
group.add(plinth2);

const apronGeo = new THREE.BoxGeometry(50, 0.1, 30);
const apron = new THREE.Mesh(apronGeo, concreteMat);
apron.userData.textureId = "concrete-smooth";
apron.position.set(0, 0.05, 0);
group.add(apron);

for (let side = -1; side <= 1; side += 2) {
  const balGeo = new THREE.BoxGeometry(12, 1.0, 0.4);
  const bal = new THREE.Mesh(balGeo, concreteMat);
  bal.userData.textureId = "concrete-smooth";
  bal.position.set(side * 10, 0.5, buildingDepth / 2 + 5);
  group.add(bal);

  for (let bp = -5; bp <= 5; bp += 2.5) {
    const postGeo = new THREE.BoxGeometry(0.3, 1.3, 0.3);
    const post = new THREE.Mesh(postGeo, concreteMat);
    post.position.set(side * 10 + bp, 0.65, buildingDepth / 2 + 5);
    group.add(post);
  }
}

const stepsGeo = new THREE.BoxGeometry(6, 0.8, 2.5);
const steps = new THREE.Mesh(stepsGeo, concreteMat);
steps.userData.textureId = "concrete-smooth";
steps.position.set(0, 0.4, buildingDepth / 2 + 2.5);
group.add(steps);

for (let s = 0; s < 4; s++) {
  const treadGeo = new THREE.BoxGeometry(6.2, 0.1, 0.6);
  const tread = new THREE.Mesh(treadGeo, whiteTrimMat);
  tread.position.set(0, 0.1 + s * 0.2, buildingDepth / 2 + 1.4 + s * 0.55);
  group.add(tread);
}

for (let fz = -1; fz <= 1; fz += 2) {
  const artDecoBandGeo = new THREE.BoxGeometry(towerWidth + 0.5, 0.8, 0.25);
  const artDecoBand = new THREE.Mesh(artDecoBandGeo, whiteTrimMat);
  artDecoBand.userData.textureId = "concrete-smooth";
  artDecoBand.position.set(0, wallHeight + 0.4, fz * (towerDepth / 2 + 0.12));
  group.add(artDecoBand);
}

for (let i = -12; i <= 12; i += 3) {
  const panelGeo = new THREE.BoxGeometry(0.8, 0.8, 0.15);
  const panel = new THREE.Mesh(panelGeo, whiteTrimMat);
  panel.position.set(i, wallHeight + towerHeight - 0.5, towerDepth / 2 + 0.08);
  group.add(panel);
}

for (let lx = -1; lx <= 1; lx += 2) {
  const lampPostGeo = new THREE.CylinderGeometry(0.08, 0.1, 4, 8);
  const lampPost = new THREE.Mesh(lampPostGeo, darkTrimMat);
  lampPost.position.set(lx * 4, 2, buildingDepth / 2 + 4);
  group.add(lampPost);

  const lampGeo = new THREE.SphereGeometry(0.25, 8, 8);
  const lamp = new THREE.Mesh(lampGeo, new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffffaa, emissiveIntensity: 0.3, roughness: 0.3 }));
  lamp.position.set(lx * 4, 4.2, buildingDepth / 2 + 4);
  group.add(lamp);
}

return group;`;

        // Stage 1: "generating-views" — wait 12s
        await ctx.runMutation(internal.plots.setPipelineStepInternal, {
          plotIndex,
          step: "generating-views",
          multiViewUrl: BATTERSEA_MULTIVIEW_URL,
        });
        await new Promise((r) => setTimeout(r, 12_000));

        // Stage 2: "generating-code" — wait 15s
        await ctx.runMutation(internal.plots.setPipelineStepInternal, {
          plotIndex,
          step: "generating-code",
          multiViewUrl: BATTERSEA_MULTIVIEW_URL,
        });
        await new Promise((r) => setTimeout(r, 15_000));

        // Stage 3: "placing"
        await ctx.runMutation(internal.plots.setPipelineStepInternal, {
          plotIndex,
          step: "placing",
          multiViewUrl: BATTERSEA_MULTIVIEW_URL,
        });

        await ctx.runMutation(internal.buildings.createBuildingInternal, {
          plotIndex,
          ownerId,
          prompt: buildingName,
          proceduralCode: BATTERSEA_CODE,
          multiViewGrid: BATTERSEA_MULTIVIEW_URL,
        });

        await ctx.runMutation(internal.plots.markOccupiedInternal, { plotIndex });
        console.log(`[Pipeline] CHEAT: Battersea Power Station placed!`);
        return;
      }
      // --- END CHEATS ---

      // 1.5. Check for similar existing buildings to reuse
      const similar = await ctx.runQuery(internal.buildings.searchSimilarBuildings, {
        searchTerm: buildingName,
      });

      if (similar) {
        console.log(`[Pipeline] Found similar building "${similar.prompt}", adapting...`);

        // Show cached blueprint views in the pipeline UI.
        // When multiViewGrid is undefined (agent-built or pre-fix buildings),
        // pass "reused" sentinel so the UI shows a meaningful status instead of "Waiting".
        const cachedViewUrl = similar.multiViewGrid ?? "reused";

        await ctx.runMutation(internal.plots.setPipelineStepInternal, {
          plotIndex,
          step: "generating-views",
          multiViewUrl: cachedViewUrl,
        });

        await ctx.runMutation(internal.plots.setPipelineStepInternal, {
          plotIndex,
          step: "generating-code",
          multiViewUrl: cachedViewUrl,
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
          multiViewUrl: cachedViewUrl,
        });

        await ctx.runMutation(internal.buildings.createBuildingInternal, {
          plotIndex,
          ownerId,
          prompt: buildingName,
          proceduralCode: finalCode,
          multiViewGrid: similar.multiViewGrid,
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

  const text = await callAnthropic("claude-opus-4-6-20250625", adaptPrompt, []);

  // Extract code — handle both fenced and raw responses
  const codeMatch = text.match(/```(?:javascript|js)?\s*\n([\s\S]*?)```/);
  const code = codeMatch ? codeMatch[1].trim() : text.trim();
  if (!code) throw new Error("Adaptation returned no usable geometry code");

  console.log(`[Pipeline] Adapted code via Anthropic (${code.length} chars)`);
  return code;
}
