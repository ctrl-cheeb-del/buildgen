import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type Message,
  type SystemContentBlock,
} from "@aws-sdk/client-bedrock-runtime";
import type { ScoreBreakdown } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Config                                                              */
/* ------------------------------------------------------------------ */

const MODEL_ID = "us.anthropic.claude-opus-4-6-v1";
const ITERATION_MODEL_ID = "us.anthropic.claude-opus-4-6-v1";
const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const MAX_SESSIONS = 50;
const SCORE_THRESHOLD = 8.0;
const MAX_TOKENS = 16384;

/* ------------------------------------------------------------------ */
/*  Bedrock client singleton                                            */
/* ------------------------------------------------------------------ */

let _client: BedrockRuntimeClient | null = null;
function getClient(): BedrockRuntimeClient {
  if (!_client) {
    _client = new BedrockRuntimeClient({
      region: process.env.AWS_DEFAULT_REGION || "us-west-2",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        sessionToken: process.env.AWS_SESSION_TOKEN,
      },
    });
  }
  return _client;
}

/** Reset the cached client so the next call picks up fresh credentials. */
export function resetBedrockClient(): void {
  _client = null;
}

function isAuthError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("security token") ||
    msg.includes("expired") ||
    msg.includes("expiredtokenexception") ||
    msg.includes("not authorized") ||
    msg.includes("invalididentitytoken")
  );
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
  messages: Message[];
  system: SystemContentBlock[];
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

type ImageFormat = "jpeg" | "png" | "gif" | "webp";

/**
 * Convert an image source to bytes. Handles both data: URLs and HTTP(S) URLs.
 */
export async function imageToBytes(
  src: string
): Promise<{ bytes: Uint8Array; format: ImageFormat }> {
  if (src.startsWith("data:")) {
    // data URL — parse base64 inline
    const match = src.match(/^data:image\/(jpeg|png|gif|webp);base64,(.+)$/);
    if (!match) {
      throw new Error("Invalid data URL format");
    }
    const format = match[1] as ImageFormat;
    const base64 = match[2];
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return { bytes, format };
  }

  // HTTP(S) URL — fetch and read as arrayBuffer
  const res = await fetch(src);
  if (!res.ok) {
    throw new Error(`Failed to fetch image: ${res.status} ${res.statusText}`);
  }
  const contentType = res.headers.get("content-type") || "image/png";
  const formatMatch = contentType.match(/image\/(jpeg|png|gif|webp)/);
  const format: ImageFormat = (formatMatch?.[1] as ImageFormat) || "png";
  const buffer = await res.arrayBuffer();
  return { bytes: new Uint8Array(buffer), format };
}

async function imageBlock(src: string): Promise<ContentBlock> {
  const { bytes, format } = await imageToBytes(src);
  return {
    image: {
      format,
      source: { bytes },
    },
  } as ContentBlock;
}

function cachePoint(): ContentBlock {
  return {
    cachePoint: { type: "default" },
  } as ContentBlock;
}

function systemCachePoint(): SystemContentBlock {
  return {
    cachePoint: { type: "default" },
  } as SystemContentBlock;
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
 * Session structure:
 *   System: [unified prompt] + cachePoint
 *   messages[0] user: [4 reference images] + generation prompt + cachePoint
 *   messages[1] assistant: [generated code] ← actual Bedrock response
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

  // System prompt
  const system: SystemContentBlock[] = [
    { text: SYSTEM_PROMPT } as SystemContentBlock,
  ];

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

  const userContent: ContentBlock[] = [
    { text: generationPrompt } as ContentBlock,
    frontImg,
    rightImg,
    backImg,
    leftImg,
  ];

  const messages: Message[] = [{ role: "user", content: userContent }];

  // Send to Bedrock
  const command = new ConverseCommand({
    modelId: MODEL_ID,
    system,
    messages,
    inferenceConfig: { maxTokens: MAX_TOKENS },
  });

  let response;
  try {
    response = await getClient().send(command);
  } catch (err) {
    if (isAuthError(err)) {
      resetBedrockClient();
      throw new Error("AWS session expired — please retry");
    }
    throw err;
  }

  // Log cache stats
  const usage = response.usage;
  if (usage) {
    console.log(
      `[BedrockConverse] Session ${sessionId} (generate): ` +
        `input=${usage.inputTokens}, output=${usage.outputTokens}, ` +
        `cacheRead=${usage.cacheReadInputTokens ?? 0}, ` +
        `cacheWrite=${usage.cacheWriteInputTokens ?? 0}`
    );
  }

  // Extract assistant response
  const outputContent = response.output;
  if (
    !outputContent ||
    !("message" in outputContent) ||
    !outputContent.message
  ) {
    throw new Error("Bedrock Converse returned no output message");
  }

  const assistantMessage = outputContent.message;
  const textBlocks = assistantMessage.content?.filter(
    (block): block is ContentBlock.TextMember => "text" in block
  );
  const rawText = textBlocks?.map((b) => b.text).join("") ?? "";

  if (!rawText) {
    throw new Error("Bedrock Converse returned empty response");
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
      `[BedrockConverse] Truncated code (braces: ${opens} open, ${closes} close)`
    );
    throw new Error(
      "LLM returned truncated code (unbalanced braces). Try a simpler building or retry."
    );
  }

  // Store session with [user msg, assistant msg]
  messages.push(assistantMessage);

  sessions.set(sessionId, {
    messages,
    system,
    buildingName,
    referenceImages,
    createdAt: now,
    lastAccessedAt: now,
  });

  console.log(
    `[BedrockConverse] Created unified session ${sessionId} for "${buildingName}" (code: ${code.length} chars)`
  );

  return { sessionId, code };
}

/**
 * Run one iteration step using standalone Sonnet calls (no multi-turn accumulation).
 *
 * Each call is stateless — builds a fresh message array with:
 *   - Reference images (from session store)
 *   - Current code + 4 render screenshots
 *   - System prompt reused from session
 *
 * Uses ITERATION_MODEL_ID (Sonnet) for ~3x faster iteration.
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

  // Build a single user message with all context
  const userContent: ContentBlock[] = [
    {
      text: `Building: "${session.buildingName}"\n\nHere are the 4 REFERENCE views (front, right, back, left):`,
    } as ContentBlock,
    refFront,
    refRight,
    refBack,
    refLeft,
    {
      text: `Here are the 4 RENDER screenshots (front, right, back, left) of the current Three.js code:`,
    } as ContentBlock,
    renFront,
    renRight,
    renBack,
    renLeft,
    {
      text: `Current Three.js code:\n\`\`\`javascript\n${currentCode}\n\`\`\`\n\nScore how well the renders match the reference images and provide improved code if needed. Respond with JSON only.`,
    } as ContentBlock,
  ];

  const messages: Message[] = [{ role: "user", content: userContent }];

  const command = new ConverseCommand({
    modelId: ITERATION_MODEL_ID,
    system: session.system,
    messages,
    inferenceConfig: { maxTokens: MAX_TOKENS },
  });

  let response;
  try {
    response = await getClient().send(command);
  } catch (err) {
    if (isAuthError(err)) {
      resetBedrockClient();
      throw new Error("AWS session expired — please retry");
    }
    throw err;
  }

  // Log token usage
  const usage = response.usage;
  if (usage) {
    console.log(
      `[BedrockConverse] Iteration (Sonnet) session ${sessionId}: ` +
        `input=${usage.inputTokens}, output=${usage.outputTokens}, ` +
        `cacheRead=${usage.cacheReadInputTokens ?? 0}, ` +
        `cacheWrite=${usage.cacheWriteInputTokens ?? 0}`
    );
  }

  // Extract assistant response text
  const outputContent = response.output;
  if (
    !outputContent ||
    !("message" in outputContent) ||
    !outputContent.message
  ) {
    throw new Error("Bedrock Converse returned no output message");
  }

  const assistantMessage = outputContent.message;
  const textBlocks = assistantMessage.content?.filter(
    (block): block is ContentBlock.TextMember => "text" in block
  );
  const rawText = textBlocks?.map((b) => b.text).join("") ?? "";

  if (!rawText) {
    throw new Error("Bedrock Converse returned empty response");
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

  const system: SystemContentBlock[] = [
    { text: SYSTEM_PROMPT } as SystemContentBlock,
  ];

  sessions.set(sessionId, {
    messages: [],
    system,
    buildingName,
    referenceImages,
    createdAt: now,
    lastAccessedAt: now,
  });

  console.log(
    `[BedrockConverse] Created iteration session ${sessionId} for "${buildingName}"`
  );

  return sessionId;
}

/**
 * Destroy a session and free memory.
 */
export function destroySession(sessionId: string): void {
  sessions.delete(sessionId);
  console.log(`[BedrockConverse] Destroyed session ${sessionId}`);
}
