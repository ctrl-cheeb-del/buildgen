import Anthropic from "@anthropic-ai/sdk";
import type { ScoreBreakdown } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Config                                                              */
/* ------------------------------------------------------------------ */

const MODEL_ID = "claude-opus-4-6-20250625";
const ITERATION_MODEL_ID = "claude-opus-4-6-20250625";
const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const MAX_SESSIONS = 50;
const SCORE_THRESHOLD = 8.0;
const MAX_TOKENS = 16384;

/* ------------------------------------------------------------------ */
/*  Anthropic client singleton                                          */
/* ------------------------------------------------------------------ */

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });
  }
  return _client;
}

/** Reset the cached client so the next call picks up fresh credentials. */
export function resetBedrockClient(): void {
  _client = null;
}

/* ------------------------------------------------------------------ */
/*  Unified system prompt (cached) — covers generation + scoring       */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `You are an expert Three.js developer and 3D building evaluator.

## TASK 1 — Generate Three.js code (first turn)
When shown reference images with a generation prompt, produce JavaScript code that creates a THREE.Group representing the building.

REQUIREMENTS:
- CRITICAL: Use 1 unit = 1 meter. The plot is 50×50 max. Use realistic footprints — do NOT fill the plot.
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
  - Supertall skyscraper: 200–400+m
  Only use the full plot if the building genuinely needs it.
- Return ONLY a JavaScript function body wrapped in: function(THREE) { ... return group; }
- Create a THREE.Group as the root
- Use THREE.BoxGeometry, CylinderGeometry, SphereGeometry, ExtrudeGeometry, Shape, LatheGeometry, etc.
- IMPORTANT: Use THREE.MeshStandardMaterial (NOT MeshPhysicalMaterial). Do NOT set side: THREE.DoubleSide.
- Match colors/materials to reference images (glass, concrete, steel, stone, etc.)
- AVOID Z-FIGHTING: offset decorative panels at least 0.3 units from walls
- NO texture loading, NO external files
- Center at origin (0,0,0) on XZ, base at Y=0 (Y-up)
- Maximum footprint: ±25 on X and ±25 on Z (50×50 hard limit). Most buildings should be MUCH smaller than this.
- Use THREE.Shape + ExtrudeGeometry for organic/curved cross-sections
- Code must be valid JavaScript runnable in a Function constructor

Wrap code in a \`\`\`javascript code block.

## TASK 2 — Score renders + improve code (subsequent turns)
When shown render screenshots alongside reference images, score how well the 3D model matches and produce improved code.

Scoring Rubric (0-10 each):
- silhouette: Does the outline match the reference views?
- proportions: Are width/height/depth ratios correct?
- features: Are key architectural features present (windows, doors, roof, decorative elements)?
- materials: Do colors and surface properties match?

Improvement Instructions:
- Focus on the lowest-scoring areas first
- Use THREE.MeshPhysicalMaterial for improvements (allowed in iteration)
- Building must stay centered at origin, Y-up
- Base footprint under 50×50
- NO texture loading, NO external files
- Return COMPLETE improved code

Response format — respond with ONLY valid JSON:
{
  "silhouette": <number 0-10>,
  "proportions": <number 0-10>,
  "features": <number 0-10>,
  "materials": <number 0-10>,
  "totalScore": <number 0-10>,
  "summary": "<specific feedback>",
  "improvedCode": "<complete improved code or null if totalScore >= 8>"
}

If totalScore >= 8.0, set improvedCode to null (converged).`;

/* ------------------------------------------------------------------ */
/*  Session store                                                       */
/* ------------------------------------------------------------------ */

interface ConverseSession {
  buildingName: string;
  referenceImages: { front: string; right: string; back: string; left: string };
  createdAt: number;
  lastAccessedAt: number;
}

const sessions = new Map<string, ConverseSession>();

/** Lazy eviction of expired sessions + hard cap */
function evictExpired() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastAccessedAt > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
  // Hard cap: evict oldest if still over limit
  if (sessions.size > MAX_SESSIONS) {
    const sorted = [...sessions.entries()].sort(
      (a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt
    );
    while (sessions.size > MAX_SESSIONS && sorted.length > 0) {
      sessions.delete(sorted.shift()![0]);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function generateId(): string {
  return crypto.randomUUID();
}

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

/**
 * Convert an image source to base64. Handles both data: URLs and HTTP(S) URLs.
 */
export async function imageToBase64(
  src: string
): Promise<{ base64: string; mediaType: ImageMediaType }> {
  if (src.startsWith("data:")) {
    const match = src.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/);
    if (!match) {
      throw new Error("Invalid data URL format");
    }
    return { base64: match[2], mediaType: match[1] as ImageMediaType };
  }

  const res = await fetch(src);
  if (!res.ok) {
    throw new Error(`Failed to fetch image: ${res.status} ${res.statusText}`);
  }
  const contentType = res.headers.get("content-type") || "image/png";
  const formatMatch = contentType.match(/image\/(jpeg|png|gif|webp)/);
  const mediaType: ImageMediaType = formatMatch
    ? (`image/${formatMatch[1]}` as ImageMediaType)
    : "image/png";
  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  return { base64, mediaType };
}

async function imageBlock(
  src: string
): Promise<Anthropic.ImageBlockParam> {
  const { base64, mediaType } = await imageToBase64(src);
  return {
    type: "image",
    source: { type: "base64", media_type: mediaType, data: base64 },
  };
}

function clampScore(val: unknown): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return 0;
  return Math.min(10, Math.max(0, n));
}

/** Extract first balanced JSON object from text */
function extractJson(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    if (text[i] === "}") depth--;
    if (depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                          */
/* ------------------------------------------------------------------ */

export interface IterationStepResult {
  score: ScoreBreakdown;
  improvedCode: string | null;
  converged: boolean;
  feedback: string;
}

/**
 * Create a new unified session AND generate the initial code (turn 1).
 *
 * Returns { sessionId, code } — the code is the generated Three.js code.
 */
export async function createSessionAndGenerate(
  referenceImages: { front: string; right: string; back: string; left: string },
  buildingName: string
): Promise<{ sessionId: string; code: string }> {
  evictExpired();

  const sessionId = generateId();
  const now = Date.now();

  // Build user message with reference images + generation prompt
  const [frontImg, rightImg, backImg, leftImg] = await Promise.all([
    imageBlock(referenceImages.front),
    imageBlock(referenceImages.right),
    imageBlock(referenceImages.back),
    imageBlock(referenceImages.left),
  ]);

  const generationPrompt = `Building: "${buildingName}"

Here are the 4 reference views (front, right, back, left). Study them carefully and generate Three.js code that recreates this building.

The description may be creative or fantastical (e.g. "a beaver-shaped building", "a mushroom tower"). Capture the distinctive outline, proportions, and character you see in the images.

Generate the code now for "${buildingName}". Wrap it in a \`\`\`javascript code block.`;

  const response = await getClient().messages.create({
    model: MODEL_ID,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: generationPrompt },
          frontImg,
          rightImg,
          backImg,
          leftImg,
        ],
      },
    ],
  });

  // Log usage
  const usage = response.usage;
  console.log(
    `[Anthropic] Session ${sessionId} (generate): ` +
      `input=${usage.input_tokens}, output=${usage.output_tokens}, ` +
      `cache_read=${(usage as unknown as Record<string, unknown>).cache_read_input_tokens ?? 0}, ` +
      `cache_write=${(usage as unknown as Record<string, unknown>).cache_creation_input_tokens ?? 0}`
  );

  // Extract text
  const textBlocks = response.content.filter(
    (block): block is Anthropic.TextBlock => block.type === "text"
  );
  const rawText = textBlocks.map((b) => b.text).join("");

  if (!rawText) {
    throw new Error("Anthropic API returned empty response");
  }

  // Extract code from markdown code blocks
  const codeMatch = rawText.match(/```(?:javascript|js)?\s*\n([\s\S]*?)```/);
  const code = codeMatch ? codeMatch[1].trim() : rawText.trim();

  if (!code) {
    throw new Error("LLM returned no usable geometry code");
  }

  // Reject truncated code (unbalanced braces = LLM hit token limit)
  const opens = (code.match(/\{/g) || []).length;
  const closes = (code.match(/\}/g) || []).length;
  if (opens !== closes) {
    console.warn(
      `[Anthropic] Truncated code (braces: ${opens} open, ${closes} close)`
    );
    throw new Error(
      "LLM returned truncated code (unbalanced braces). Try a simpler building or retry."
    );
  }

  // Store session
  sessions.set(sessionId, {
    buildingName,
    referenceImages,
    createdAt: now,
    lastAccessedAt: now,
  });

  console.log(
    `[Anthropic] Created unified session ${sessionId} for "${buildingName}" (code: ${code.length} chars)`
  );

  return { sessionId, code };
}

/**
 * Run one iteration step using standalone calls (no multi-turn accumulation).
 *
 * Each call is stateless — builds a fresh message array with:
 *   - Reference images (from session store)
 *   - Current code + 4 render screenshots
 *   - System prompt
 */
export async function runIterationStep(
  sessionId: string,
  renderScreenshots: {
    front: string;
    right: string;
    back: string;
    left: string;
  },
  currentCode: string
): Promise<IterationStepResult> {
  evictExpired();

  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found or expired`);
  }
  session.lastAccessedAt = Date.now();

  // Build reference + render image blocks in parallel
  const [refFront, refRight, refBack, refLeft, renFront, renRight, renBack, renLeft] =
    await Promise.all([
      imageBlock(session.referenceImages.front),
      imageBlock(session.referenceImages.right),
      imageBlock(session.referenceImages.back),
      imageBlock(session.referenceImages.left),
      imageBlock(renderScreenshots.front),
      imageBlock(renderScreenshots.right),
      imageBlock(renderScreenshots.back),
      imageBlock(renderScreenshots.left),
    ]);

  const response = await getClient().messages.create({
    model: ITERATION_MODEL_ID,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Building: "${session.buildingName}"\n\nHere are the 4 REFERENCE views (front, right, back, left):`,
          },
          refFront,
          refRight,
          refBack,
          refLeft,
          {
            type: "text",
            text: `Here are the 4 RENDER screenshots (front, right, back, left) of the current Three.js code:`,
          },
          renFront,
          renRight,
          renBack,
          renLeft,
          {
            type: "text",
            text: `Current Three.js code:\n\`\`\`javascript\n${currentCode}\n\`\`\`\n\nScore how well the renders match the reference images and provide improved code if needed. Respond with JSON only.`,
          },
        ],
      },
    ],
  });

  // Log token usage
  const usage = response.usage;
  console.log(
    `[Anthropic] Iteration session ${sessionId}: ` +
      `input=${usage.input_tokens}, output=${usage.output_tokens}, ` +
      `cache_read=${(usage as unknown as Record<string, unknown>).cache_read_input_tokens ?? 0}, ` +
      `cache_write=${(usage as unknown as Record<string, unknown>).cache_creation_input_tokens ?? 0}`
  );

  // Extract text
  const textBlocks = response.content.filter(
    (block): block is Anthropic.TextBlock => block.type === "text"
  );
  const rawText = textBlocks.map((b) => b.text).join("");

  if (!rawText) {
    throw new Error("Anthropic API returned empty response");
  }

  // Parse the JSON response — use balanced brace extraction
  const jsonStr = extractJson(rawText);
  if (!jsonStr) {
    throw new Error(
      `Model did not return valid JSON: ${rawText.slice(0, 200)}`
    );
  }

  const parsed = JSON.parse(jsonStr);

  const sil = clampScore(parsed.silhouette);
  const prop = clampScore(parsed.proportions);
  const feat = clampScore(parsed.features);
  const mat = clampScore(parsed.materials);
  const totalScore = (sil + prop + feat + mat) / 4;

  const score: ScoreBreakdown = {
    silhouette: sil,
    proportions: prop,
    features: feat,
    materials: mat,
    totalScore,
    summary: String(parsed.summary || ""),
  };

  const converged = totalScore >= SCORE_THRESHOLD;
  const improvedCode =
    converged || !parsed.improvedCode ? null : String(parsed.improvedCode);

  return {
    score,
    improvedCode,
    converged,
    feedback: score.summary,
  };
}

/**
 * Create a lightweight iteration session (no LLM call).
 * Just stores reference images + system prompt so runIterationStep can reuse them.
 */
export function createIterationSession(
  referenceImages: { front: string; right: string; back: string; left: string },
  buildingName: string
): string {
  evictExpired();

  const sessionId = generateId();
  const now = Date.now();

  sessions.set(sessionId, {
    buildingName,
    referenceImages,
    createdAt: now,
    lastAccessedAt: now,
  });

  console.log(
    `[Anthropic] Created iteration session ${sessionId} for "${buildingName}"`
  );

  return sessionId;
}

/**
 * Destroy a session and free memory.
 */
export function destroySession(sessionId: string): void {
  sessions.delete(sessionId);
  console.log(`[Anthropic] Destroyed session ${sessionId}`);
}
