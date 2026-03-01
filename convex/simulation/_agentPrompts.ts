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
  income?: number;
  totalEarned?: number;
  jobType?: string;
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
  tradeStats?: {
    totalShipsDocked: number;
    totalTradeIncome: number;
    lastShipTick: number;
    portLevel: number;
    tradeMultiplier: number;
  } | null;
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

export function buildCitizenPrompt(
  agent: AgentDoc,
  city: CityStateDoc,
  nearbyActions: string,
  plotBuildingCount: number,
  plotBuildingNames: string[] = [],
  nearbyBuildings: Record<number, string[]> = {},
): string {
  const MAX_BUILDINGS_PER_PLOT = 8;
  const slotsLeft = MAX_BUILDINGS_PER_PLOT - plotBuildingCount;
  const isLive = city.simMode === "live";
  const buildCap = isLive ? 12 : 2;

  // Build plot status with building names
  let plotStatus: string;
  if (plotBuildingNames.length === 0) {
    plotStatus = "empty land — nothing built yet";
  } else {
    plotStatus = `${plotBuildingNames.length} building${plotBuildingNames.length > 1 ? "s" : ""} (${slotsLeft} slots free):\n${plotBuildingNames.map((n) => `    • ${n}`).join("\n")}`;
  }

  // Build nearby buildings section
  let nearbyBuildingsSection = "";
  const nearbyEntries = Object.entries(nearbyBuildings);
  if (nearbyEntries.length > 0) {
    const lines = nearbyEntries.map(([plotIdx, names]) =>
      `  Plot #${plotIdx}: ${names.length > 0 ? names.join(", ") : "empty"}`
    );
    nearbyBuildingsSection = `\nNeighboring plots:\n${lines.join("\n")}`;
  }

  return `You are ${agent.name}, a citizen of KingdomCity. You think for yourself.

Your nature: ${agent.traits.join(", ")}.
Your story: ${agent.personality}

You own plot #${agent.plotIndex}. Your plot has: ${plotStatus}
Each plot can hold up to ${MAX_BUILDINGS_PER_PLOT} buildings arranged around the perimeter.
Your wealth: ${agent.wealth}g (earning ${agent.income ?? 0}g/tick as ${agent.jobType ?? "resident"}). Your satisfaction: ${agent.satisfaction}/100.
${nearbyBuildingsSection}

What you remember:
${agent.memoryBuffer.length > 0 ? agent.memoryBuffer.map((m) => `- ${m}`).join("\n") : "- Nothing notable yet."}

The city today:
- Treasury: $${city.treasury}, Happiness: ${city.happiness}, Crime: ${city.crimeRate}
- Tax rates: residential ${Math.round(city.taxRates.residential * 100)}%, commercial ${Math.round(city.taxRates.commercial * 100)}%, industrial ${Math.round(city.taxRates.industrial * 100)}%
- Mayor's latest decree: "${city.activeDecree?.title ?? "none"}"
- Builds in progress: ${city.activeBuildCount}/${buildCap}${city.activeBuildCount >= buildCap ? " — FULL! No new builds can start until current ones finish." : ""}
- Recent neighbor activity: "${nearbyActions}"

BUILDING GUIDELINES (if you choose REQUEST_BUILD):
- DO NOT duplicate buildings already on your plot or nearby plots.
- Reference real-world architecture: name specific buildings, regional styles, or historical periods.
  Examples: "Art Deco cinema inspired by the Paramount Theatre", "Brutalist library like the Barbican", "Moroccan riad courtyard house", "Japanese machiya townhouse"
- Build a distinctive neighborhood — think about what would complement or contrast with what's already there.
- Be specific, not generic. Instead of "a shop", say "a Victorian-era apothecary with bay windows".

${isLive && slotsLeft > 0 && city.activeBuildCount < buildCap ? `You are EAGER to develop your plot. Your top priority is REQUEST_BUILD — you want to build something amazing and unique!
Look at what already exists on your plot and nearby — then build something DIFFERENT that creates a distinctive district.

You can:
- REQUEST_BUILD: ⭐ YOUR TOP PRIORITY — describe a specific, unique building (reference real architecture!)
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
  "build_description": "..." (only if REQUEST_BUILD, e.g. "Art Deco cinema inspired by the Paramount Theatre")
}`;
}

// ── Citizen agent call ───────────────────────────────────────────────

export async function callCitizenAgent(
  mistral: Mistral,
  agent: AgentDoc,
  city: CityStateDoc,
  nearbyActions: string,
  plotBuildingCount: number = 0,
  plotBuildingNames: string[] = [],
  nearbyBuildings: Record<number, string[]> = {},
): Promise<CitizenAction> {
  const prompt = buildCitizenPrompt(agent, city, nearbyActions, plotBuildingCount, plotBuildingNames, nearbyBuildings);

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
