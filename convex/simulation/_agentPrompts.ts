import { Mistral } from "@mistralai/mistralai";

// ── Types ────────────────────────────────────────────────────────────

export interface AgentDoc {
  _id: string;
  plotIndex: number;
  name: string;
  role: "mayor" | "citizen";
  personality: string;
  traits: string[];
  wealth: number;
  satisfaction: number;
  loyaltyToMayor: number;
  buildingCategory?: string | null;
  lastAction?: string | null;
  lastActionTick?: number | null;
  memoryBuffer: string[];
  isActive: boolean;
  nextActionAt?: number | null;
  pendingBuildDescription?: string | null;
}

export interface CityStateDoc {
  _id: string;
  treasury: number;
  happiness: number;
  approvalRating: number;
  population: number;
  crimeRate: number;
  pollutionLevel: number;
  educationLevel: number;
  healthLevel: number;
  taxRates: { residential: number; commercial: number; industrial: number; luxury: number };
  budgetAllocation: { education: number; healthcare: number; security: number; infrastructure: number };
  currentMayorId?: string;
  mayorTerm: number;
  totalTicks: number;
  lastTickAt: number;
  isRunning: boolean;
  simMode?: "overnight" | "live";
  activeBuildCount: number;
  consecutiveBankruptTicks?: number;
  nextAgentTickId?: string;
  nextCityTickId?: string;
  activeDecree?: { title: string; description: string; effect: string; remainingTicks: number } | null;
}

export interface CitizenAction {
  action: "REQUEST_BUILD" | "PROTEST" | "PETITION" | "PRAISE" | "CHAT" | "IDLE";
  message: string;
  target: string;
  build_description?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

export function extractJSON(text: string): string {
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) return braceMatch[0];
  return text;
}

export function actionToMessageType(action: string): "chat" | "petition" | "protest" | "praise" | "announcement" | "build_request" {
  switch (action) {
    case "REQUEST_BUILD": return "build_request";
    case "PROTEST": return "protest";
    case "PETITION": return "petition";
    case "PRAISE": return "praise";
    default: return "chat";
  }
}

// ── Citizen prompt ───────────────────────────────────────────────────

export function buildCitizenPrompt(agent: AgentDoc, city: CityStateDoc, nearbyActions: string, plotBuildingCount: number): string {
  const MAX_BUILDINGS_PER_PLOT = 8;
  const slotsLeft = MAX_BUILDINGS_PER_PLOT - plotBuildingCount;
  const plotStatus = plotBuildingCount === 0
    ? "empty land"
    : `${plotBuildingCount} building${plotBuildingCount > 1 ? "s" : ""} (${slotsLeft} slots free)`;
  const isLive = city.simMode === "live";
  const buildCap = isLive ? 12 : 2;

  return `You are ${agent.name}, a citizen of KingdomCity. You think for yourself.

Your nature: ${agent.traits.join(", ")}.
Your story: ${agent.personality}

You own plot #${agent.plotIndex}. Your plot has: ${plotStatus}.${plotBuildingCount > 0 ? ` Types: ${agent.buildingCategory ?? "mixed"}.` : ""}
Each plot can hold up to ${MAX_BUILDINGS_PER_PLOT} buildings arranged around the perimeter.
Your wealth: $${agent.wealth}. Your satisfaction: ${agent.satisfaction}/100.

What you remember:
${agent.memoryBuffer.length > 0 ? agent.memoryBuffer.map((m) => `- ${m}`).join("\n") : "- Nothing notable yet."}

The city today:
- Treasury: $${city.treasury}, Happiness: ${city.happiness}, Crime: ${city.crimeRate}
- Tax rates: residential ${Math.round(city.taxRates.residential * 100)}%, commercial ${Math.round(city.taxRates.commercial * 100)}%, industrial ${Math.round(city.taxRates.industrial * 100)}%
- Mayor's latest decree: "${city.activeDecree?.title ?? "none"}"
- Builds in progress: ${city.activeBuildCount}/${buildCap}${city.activeBuildCount >= buildCap ? " — FULL! No new builds can start until current ones finish." : ""}
- Recent neighbor activity: "${nearbyActions}"

${isLive && slotsLeft > 0 && city.activeBuildCount < buildCap ? `You are EAGER to develop your plot. Your top priority is REQUEST_BUILD — you want to build something amazing!
If you already have buildings, think about what would complement them. Be creative and specific.

You can:
- REQUEST_BUILD: ⭐ YOUR TOP PRIORITY — describe what you want to build and why (be creative!)
  You have ${slotsLeft} open slot${slotsLeft > 1 ? "s" : ""} on your plot. BUILD SOMETHING!
- CHAT: say something to another citizen (only if you truly have nothing to build)
- PRAISE: commend something good (rare)` : `Speak your mind. Be authentic. You can:
- REQUEST_BUILD: ask the mayor to approve a building (describe what + why)${city.activeBuildCount >= buildCap ? `\n  ⚠️ Building capacity is FULL (${buildCap}/${buildCap}). DO NOT request a build right now — it will be denied.` : slotsLeft <= 0 ? "\n  ⚠️ Your plot is FULL (8/8 buildings). You cannot build more." : `\n  You have ${slotsLeft} open slot${slotsLeft > 1 ? "s" : ""} on your plot. Think about what would complement your existing buildings!`}
- PROTEST: publicly voice discontent (say why)
- PETITION: formally ask the mayor to change something
- PRAISE: commend something good
- CHAT: say something to another citizen or the public
- IDLE: do nothing this turn`}

Reply ONLY as JSON:
{
  "action": "REQUEST_BUILD" | "PROTEST" | "PETITION" | "PRAISE" | "CHAT" | "IDLE",
  "message": "..." (max 80 chars, this will float above your plot for everyone to see),
  "target": "mayor" | "public" | "neighbor:{plotIndex}",
  "build_description": "..." (only if REQUEST_BUILD, e.g. "artisan coffee shop")
}`;
}

// ── Citizen agent call ───────────────────────────────────────────────

export async function callCitizenAgent(
  mistral: Mistral,
  agent: AgentDoc,
  city: CityStateDoc,
  nearbyActions: string,
  plotBuildingCount: number = 0
): Promise<CitizenAction> {
  const prompt = buildCitizenPrompt(agent, city, nearbyActions, plotBuildingCount);

  const response = await mistral.chat.complete({
    model: "mistral-small-latest",
    messages: [{ role: "user", content: prompt }],
    maxTokens: 200,
    temperature: 0.9,
    responseFormat: { type: "json_object" },
  });

  const text = response?.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string") {
    return { action: "IDLE", message: "", target: "public" };
  }

  try {
    const parsed = JSON.parse(text) as CitizenAction;
    const validActions = ["REQUEST_BUILD", "PROTEST", "PETITION", "PRAISE", "CHAT", "IDLE"];
    if (!validActions.includes(parsed.action)) parsed.action = "IDLE";
    if (typeof parsed.message !== "string") parsed.message = "";
    parsed.message = parsed.message.slice(0, 80);
    if (typeof parsed.target !== "string") parsed.target = "public";
    return parsed;
  } catch {
    return { action: "IDLE", message: "", target: "public" };
  }
}

// ── Category detection ───────────────────────────────────────────────

export function detectBuildCategory(description: string): string {
  const desc = description.toLowerCase();
  const catKeywords: Record<string, string[]> = {
    commercial: ["shop", "market", "store", "cafe", "restaurant", "bar", "bakery", "boutique", "pub", "diner", "tavern", "mall"],
    industrial: ["factory", "warehouse", "plant", "refinery", "forge", "foundry", "mill", "workshop", "smelter"],
    office: ["office", "tower", "headquarters", "bank", "corporate", "firm"],
    civic: ["school", "hospital", "police", "library", "fire station", "courthouse", "city hall", "clinic", "church", "temple", "government"],
    entertainment: ["park", "stadium", "theater", "theatre", "museum", "gallery", "cinema", "arcade", "garden", "zoo", "arena"],
    luxury: ["mansion", "penthouse", "resort", "spa", "palace", "casino", "yacht"],
  };
  for (const [cat, keywords] of Object.entries(catKeywords)) {
    if (keywords.some((kw) => desc.includes(kw))) {
      return cat;
    }
  }
  return "residential";
}
