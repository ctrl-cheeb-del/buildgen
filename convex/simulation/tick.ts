"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { Mistral } from "@mistralai/mistralai";

// ── Types ────────────────────────────────────────────────────────────

interface AgentDoc {
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
}

interface CityStateDoc {
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
  activeBuildCount: number;
  consecutiveBankruptTicks?: number;
  activeDecree?: { title: string; description: string; effect: string; remainingTicks: number } | null;
}

interface CitizenAction {
  action: "REQUEST_BUILD" | "PROTEST" | "PETITION" | "PRAISE" | "CHAT" | "IDLE";
  message: string;
  target: string;
  build_description?: string;
}

interface MayorDecision {
  build_approvals: Array<{ agentPlot: number; approved: boolean; reason: string }>;
  tax_changes: Record<string, number> | null;
  budget_changes: Record<string, number> | null;
  decree: { title: string; description: string; duration: number; effect: string } | null;
  public_message: string;
  mood: string;
}

// ── LLM helpers ──────────────────────────────────────────────────────

function getMistral(): Mistral {
  return new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
}

function extractJSON(text: string): string {
  // Try to find JSON in the response, handling markdown code blocks
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) return braceMatch[0];
  return text;
}

// ── Citizen prompt ───────────────────────────────────────────────────

function buildCitizenPrompt(agent: AgentDoc, city: CityStateDoc, nearbyActions: string, plotBuildingCount: number): string {
  const MAX_BUILDINGS_PER_PLOT = 8;
  const slotsLeft = MAX_BUILDINGS_PER_PLOT - plotBuildingCount;
  const plotStatus = plotBuildingCount === 0
    ? "empty land"
    : `${plotBuildingCount} building${plotBuildingCount > 1 ? "s" : ""} (${slotsLeft} slots free)`;

  return `You are ${agent.name}, a citizen of KingdomCity. You think for yourself.

Your nature: ${agent.traits.join(", ")}.
Your story: ${agent.personality}

You own plot #${agent.plotIndex}. Your plot has: ${plotStatus}.${plotBuildingCount > 0 ? ` Types: ${agent.buildingCategory ?? "mixed"}.` : ""}
Each plot can hold up to ${MAX_BUILDINGS_PER_PLOT} buildings arranged around the perimeter.
Your wealth: ${agent.wealth} gold. Your satisfaction: ${agent.satisfaction}/100.

What you remember:
${agent.memoryBuffer.length > 0 ? agent.memoryBuffer.map((m) => `- ${m}`).join("\n") : "- Nothing notable yet."}

The city today:
- Treasury: ${city.treasury} gold, Happiness: ${city.happiness}, Crime: ${city.crimeRate}
- Tax rates: residential ${Math.round(city.taxRates.residential * 100)}%, commercial ${Math.round(city.taxRates.commercial * 100)}%, industrial ${Math.round(city.taxRates.industrial * 100)}%
- Mayor's latest decree: "${city.activeDecree?.title ?? "none"}"
- Builds in progress: ${city.activeBuildCount}/4${city.activeBuildCount >= 4 ? " — FULL! No new builds can start until current ones finish. Building takes a LONG time." : ""}
- Recent neighbor activity: "${nearbyActions}"

Speak your mind. Be authentic. You can:
- REQUEST_BUILD: ask the mayor to approve a building (describe what + why)${city.activeBuildCount >= 4 ? "\n  ⚠️ Building capacity is FULL (4/4). DO NOT request a build right now — it will be denied. Do something else instead." : slotsLeft <= 0 ? "\n  ⚠️ Your plot is FULL (8/8 buildings). You cannot build more." : `\n  You have ${slotsLeft} open slot${slotsLeft > 1 ? "s" : ""} on your plot. Think about what would complement your existing buildings!`}
- PROTEST: publicly voice discontent (say why)
- PETITION: formally ask the mayor to change something
- PRAISE: commend something good
- CHAT: say something to another citizen or the public
- IDLE: do nothing this turn

Reply ONLY as JSON:
{
  "action": "REQUEST_BUILD" | "PROTEST" | "PETITION" | "PRAISE" | "CHAT" | "IDLE",
  "message": "..." (max 80 chars, this will float above your plot for everyone to see),
  "target": "mayor" | "public" | "neighbor:{plotIndex}",
  "build_description": "..." (only if REQUEST_BUILD, e.g. "artisan coffee shop")
}`;
}

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
  });

  const text = response?.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string") {
    return { action: "IDLE", message: "", target: "public" };
  }

  try {
    const parsed = JSON.parse(extractJSON(text)) as CitizenAction;
    // Validate and clamp message
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

// ── Mayor prompt ─────────────────────────────────────────────────────

function buildMayorPrompt(
  city: CityStateDoc,
  income: number,
  expenses: number,
  petitions: string,
  buildRequests: string
): string {
  const slotsAvailable = Math.max(0, 4 - city.activeBuildCount);
  const treasuryWarning = city.treasury < 2000
    ? `\n⚠️ TREASURY CRITICAL: Only ${city.treasury}g left! Treasury CANNOT go below 0. If expenses exceed income, emergency austerity kicks in. Consider raising taxes or cutting budget.`
    : "";

  return `You are King Mistral, ruler of KingdomCity. You have 40 citizens on 40 plots.
Each plot can hold up to 8 buildings arranged around the perimeter. Citizens can build multiple buildings to develop their plots.

City state:
- Treasury: ${city.treasury} gold (income: ${income}/tick, expenses: ${expenses}/tick, net: ${income - expenses}/tick)
- Happiness: ${city.happiness}/100, Crime: ${city.crimeRate}/100, Pollution: ${city.pollutionLevel}/100
- Approval rating: ${city.approvalRating}/100
- Builds in progress: ${city.activeBuildCount}/4 — ${slotsAvailable} slots available
  IMPORTANT: Each build takes a LONG time (1-3 minutes). Build slots are precious.${city.activeBuildCount >= 4 ? "\n  🚫 ALL BUILD SLOTS FULL. You MUST deny all build requests this tick." : ""}
  Think strategically: what does the city NEED most? Revenue buildings (commercial, industrial, luxury) or population/happiness (residential, civic, entertainment)?
  ECONOMICS: Buildings generate base income automatically. Taxes add citizen revenue on top. But maintenance grows QUADRATICALLY — more buildings = exponentially higher costs. You MUST balance growth with fiscal discipline.
- Current tax rates: res ${Math.round(city.taxRates.residential * 100)}%, com ${Math.round(city.taxRates.commercial * 100)}%, ind ${Math.round(city.taxRates.industrial * 100)}%, lux ${Math.round(city.taxRates.luxury * 100)}%
  WARNING: Taxes above 20% trigger tax fatigue (evasion). Above 30% citizens get unhappy. But too low = deficit!
- Budget: edu ${Math.round(city.budgetAllocation.education * 100)}%, health ${Math.round(city.budgetAllocation.healthcare * 100)}%, security ${Math.round(city.budgetAllocation.security * 100)}%, infra ${Math.round(city.budgetAllocation.infrastructure * 100)}%
- Active decree: ${city.activeDecree?.title ?? "none"}
- Next election in: ${city.mayorTerm} ticks${treasuryWarning}

Citizen petitions this tick:
${petitions || "None."}

Pending build requests:
${buildRequests || "None."}

You must decide:
1. APPROVE or DENY each build request (you have ${slotsAvailable} slots available — be selective! Prioritize what the city needs most)
2. Optionally adjust tax rates (small increments, ±0.02 max per tick) — you NEED revenue from buildings!
3. Optionally adjust budget allocation
4. Optionally issue a decree (temporary policy, 5-15 ticks)
5. A public message (max 80 chars, displayed at city hall) — address capacity limits if builds are full

Reply ONLY as JSON:
{
  "build_approvals": [{ "agentPlot": N, "approved": true/false, "reason": "..." }],
  "tax_changes": { "residential": 0.01 } | null,
  "budget_changes": { "security": 0.05, "education": -0.05 } | null,
  "decree": { "title": "...", "description": "...", "duration": 10, "effect": "happiness+5" } | null,
  "public_message": "...",
  "mood": "satisfied" | "concerned" | "wrathful" | "celebratory"
}`;
}

export async function callMayor(
  mistral: Mistral,
  city: CityStateDoc,
  income: number,
  expenses: number,
  petitions: string,
  buildRequests: string
): Promise<MayorDecision> {
  const prompt = buildMayorPrompt(city, income, expenses, petitions, buildRequests);

  const response = await mistral.chat.complete({
    model: "mistral-small-latest",
    messages: [{ role: "user", content: prompt }],
    maxTokens: 400,
    temperature: 0.7,
  });

  const text = response?.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string") {
    return {
      build_approvals: [],
      tax_changes: null,
      budget_changes: null,
      decree: null,
      public_message: "The king is silent.",
      mood: "concerned",
    };
  }

  try {
    const parsed = JSON.parse(extractJSON(text)) as MayorDecision;

    // HARD CAP: enforce 4-build limit in code
    if (Array.isArray(parsed.build_approvals)) {
      let remainingSlots = 4 - city.activeBuildCount;
      for (const approval of parsed.build_approvals) {
        if (remainingSlots <= 0) {
          approval.approved = false;
          approval.reason = "Build queue full (4/4)";
        } else if (approval.approved) {
          remainingSlots--;
        }
      }
    } else {
      parsed.build_approvals = [];
    }

    // Clamp tax changes to ±0.02
    if (parsed.tax_changes && typeof parsed.tax_changes === "object") {
      for (const [key, val] of Object.entries(parsed.tax_changes)) {
        parsed.tax_changes[key] = Math.max(-0.02, Math.min(0.02, val));
      }
    }

    if (typeof parsed.public_message !== "string") parsed.public_message = "";
    parsed.public_message = parsed.public_message.slice(0, 80);

    return parsed;
  } catch {
    return {
      build_approvals: [],
      tax_changes: null,
      budget_changes: null,
      decree: null,
      public_message: "The king ponders...",
      mood: "concerned",
    };
  }
}

// ── Action-to-message-type mapping ───────────────────────────────────

function actionToMessageType(action: string): "chat" | "petition" | "protest" | "praise" | "announcement" | "build_request" {
  switch (action) {
    case "REQUEST_BUILD": return "build_request";
    case "PROTEST": return "protest";
    case "PETITION": return "petition";
    case "PRAISE": return "praise";
    default: return "chat";
  }
}

// ── Main tick engine ─────────────────────────────────────────────────

export const run = internalAction({
  args: {},
  handler: async (ctx) => {
    // Step 1: Snapshot
    const city: CityStateDoc | null = await ctx.runQuery(internal.simulation.cityState.getInternal);
    if (!city || !city.isRunning) {
      console.log("[tick] Simulation not running, stopping");
      return;
    }

    const agents: AgentDoc[] = await ctx.runQuery(internal.simulation.agents.getAllInternal);
    const tickNumber = city.totalTicks + 1;
    const mistral = getMistral();

    console.log(`[tick ${tickNumber}] Starting...`);

    // Step 2: Compute metrics (pure math — rebalanced economics)
    const allBuildings: Array<{ _id: string; plotIndex: number; category?: string; ownerId: string }> = await ctx.runQuery(internal.simulation._buildingHelpers.getAllWithCategory as any);
    const census: Record<string, number> = {
      residential: 0, commercial: 0, industrial: 0,
      office: 0, civic: 0, entertainment: 0, luxury: 0,
    };
    for (const b of allBuildings) {
      if (b.category && b.category in census) census[b.category]++;
    }
    const totalBuildings = Object.values(census).reduce((a, b) => a + b, 0);

    const budget = city.budgetAllocation;
    const taxRates = city.taxRates;

    const population = census.residential * 120 + census.luxury * 40 + 200;

    // ── TAX FATIGUE: High taxes reduce effective revenue
    function taxEfficiency(rate: number): number {
      if (rate <= 0.2) return 1.0;
      return Math.max(0.4, 1.0 - (rate - 0.2) * 1.3);
    }

    // ── INCOME (dual sources) ──
    // 1. Base building income — economic activity, always flows to treasury
    const baseIncomeMap: Record<string, number> = {
      residential: 40, commercial: 80, industrial: 100, office: 90,
      civic: -30, entertainment: 50, luxury: 120,
    };
    // Crime penalty: high crime from LAST tick scares away businesses
    // At 100 crime → 50% revenue cut on commercial/office/luxury
    const prevCrime = city.crimeRate ?? 0;
    const crimePenalty = 1 - prevCrime / 200;
    const crimeAffected = new Set(["commercial", "office", "luxury"]);
    let baseIncome = 0;
    for (const [cat, count] of Object.entries(census)) {
      const raw = count * (baseIncomeMap[cat] || 0);
      baseIncome += crimeAffected.has(cat) ? raw * crimePenalty : raw;
    }

    // 2. Tax revenue — scales with population and average tax rate (with fatigue)
    const avgTaxRate = (taxRates.residential + taxRates.commercial + taxRates.industrial + taxRates.luxury) / 4;
    const citizenTaxRevenue = Math.round(population * avgTaxRate * 0.5 * taxEfficiency(avgTaxRate));
    const taxRevenue = Math.round(baseIncome) + citizenTaxRevenue;

    // ── EXPENSES: population-scaled + QUADRATIC building maintenance + inflation ──
    const baseUpkeep = Math.round(population * 0.15);
    const budgetTotal = budget.education + budget.healthcare + budget.security + budget.infrastructure;
    const serviceCosts = Math.round(budgetTotal * population * 0.3);
    const maintenanceCost = Math.round(totalBuildings * 15 + totalBuildings * totalBuildings * 1.5);
    const inflationMultiplier = 1 + Math.floor(tickNumber / 10) * 0.01;
    const totalExpenses = Math.round((baseUpkeep + serviceCosts + maintenanceCost) * inflationMultiplier);

    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

    // ── TREASURY STRESS: when money is low, can't fund services → crime rises ──
    // Below 5000g treasury, crime starts creeping up. At 0g → +25 crime.
    const treasuryStress = Math.max(0, 1 - city.treasury / 5000) * 25;
    const crimeRate = clamp(30 + census.industrial * 8 - census.civic * 15 - budget.security * 40 + treasuryStress, 0, 100);
    const pollutionLevel = clamp(10 + census.industrial * 12 + census.commercial * 3 - budget.infrastructure * 20, 0, 100);
    const educationLevel = clamp(20 + census.civic * 10 + budget.education * 60, 0, 100);
    const healthLevel = clamp(20 + census.civic * 8 + budget.healthcare * 60, 0, 100);

    // High taxes reduce happiness (citizens feel the burden)
    const taxBurden = avgTaxRate > 0.3 ? (avgTaxRate - 0.3) * 30 : 0;

    // ── RANDOM CRISIS EVENTS (8% chance per tick) ──
    let crisisMessage = "";
    let crisisHappinessMod = 0;
    let crisisTreasuryHit = 0;
    let crisisCrimeMod = 0;
    const crisisRoll = Math.random();
    if (crisisRoll < 0.02) {
      // Crime wave — 2% chance
      crisisCrimeMod = 20;
      crisisHappinessMod = -10;
      crisisMessage = "A crime wave has swept through the city! Citizens live in fear.";
      console.log(`[tick ${tickNumber}] CRISIS: Crime wave!`);
    } else if (crisisRoll < 0.04) {
      // Epidemic — 2% chance
      crisisHappinessMod = -15;
      crisisTreasuryHit = Math.round(population * 0.5);
      crisisMessage = "An epidemic is spreading! Healthcare costs skyrocket.";
      console.log(`[tick ${tickNumber}] CRISIS: Epidemic! Treasury hit: ${crisisTreasuryHit}`);
    } else if (crisisRoll < 0.06) {
      // Industrial accident — 2% chance (only if industrial buildings exist)
      if (census.industrial > 0) {
        crisisHappinessMod = -8;
        crisisTreasuryHit = Math.round(census.industrial * 200);
        crisisMessage = "An industrial accident has occurred! Cleanup costs are massive.";
        console.log(`[tick ${tickNumber}] CRISIS: Industrial accident! Cost: ${crisisTreasuryHit}`);
      }
    } else if (crisisRoll < 0.08) {
      // Trade boom — 2% chance (positive event, but rare)
      crisisHappinessMod = 5;
      crisisTreasuryHit = -Math.round(population * 0.3); // negative = bonus
      crisisMessage = "A trade caravan has arrived! The economy flourishes briefly.";
      console.log(`[tick ${tickNumber}] EVENT: Trade boom! Treasury bonus: ${-crisisTreasuryHit}`);
    }

    const happiness = clamp(
      50 + census.entertainment * 5 - crimeRate * 0.3 - pollutionLevel * 0.2 +
      educationLevel * 0.1 + healthLevel * 0.15 - taxBurden + crisisHappinessMod,
      0, 100
    );

    // Step 3: Citizen actions (~10 per tick via activity roll)
    const citizens = agents.filter((a) => a.role === "citizen" && a.isActive);
    const activeThisTick = citizens
      .filter(() => Math.random() < 0.25) // ~25% chance → ~10 agents
      .slice(0, 12); // hard cap at 12

    const citizenResults: Array<{ agent: AgentDoc; action: CitizenAction }> = [];
    const buildRequests: Array<{ agent: AgentDoc; action: CitizenAction }> = [];
    const petitionTexts: string[] = [];

    // Build a map of building count per plot for citizen prompts
    const plotBuildingCounts: Record<number, number> = {};
    for (const b of allBuildings) {
      plotBuildingCounts[b.plotIndex] = (plotBuildingCounts[b.plotIndex] ?? 0) + 1;
    }

    if (activeThisTick.length > 0) {
      const results = await Promise.all(
        activeThisTick.map(async (agent) => {
          try {
            const nearby = citizens
              .filter((c) => Math.abs(c.plotIndex - agent.plotIndex) <= 8 && c._id !== agent._id)
              .slice(0, 3)
              .map((c) => c.lastAction ? `${c.name}: ${c.lastAction}` : `${c.name} is quiet`)
              .join("; ");

            const action = await callCitizenAgent(mistral, agent, city, nearby || "All quiet", plotBuildingCounts[agent.plotIndex] ?? 0);
            return { agent, action };
          } catch (e) {
            console.error(`[tick ${tickNumber}] Agent ${agent.name} failed:`, e);
            return { agent, action: { action: "IDLE" as const, message: "", target: "public" } };
          }
        })
      );

      for (const result of results) {
        citizenResults.push(result);

        if (result.action.action === "REQUEST_BUILD") {
          const plotCount = plotBuildingCounts[result.agent.plotIndex] ?? 0;
          if (plotCount >= 8) {
            // Plot full — convert to chat
            result.action.action = "CHAT";
            result.action.message = result.action.message || "My plot is fully developed!";
          } else if (city.activeBuildCount + buildRequests.length < 4) {
            buildRequests.push(result);
          } else {
            // Capacity full — convert to a chat about waiting
            result.action.action = "CHAT";
            result.action.message = result.action.message || "Building capacity is full... we must wait.";
          }
        }
        if (result.action.action === "PROTEST" || result.action.action === "PETITION") {
          petitionTexts.push(`${result.agent.name} (plot #${result.agent.plotIndex}): ${result.action.message}`);
        }

        // Store message (skip IDLE with empty message)
        if (result.action.action !== "IDLE" || result.action.message) {
          await ctx.runMutation(internal.simulation.agentMessages.create, {
            senderPlotIndex: result.agent.plotIndex,
            senderName: result.agent.name,
            content: result.action.message.slice(0, 80) || `[${result.action.action}]`,
            messageType: actionToMessageType(result.action.action),
            tickNumber,
          });
        }
      }
    }

    // Step 4: Mayor decision
    const buildRequestText = buildRequests
      .map((r) => `${r.agent.name} (plot #${r.agent.plotIndex}): wants to build "${r.action.build_description}"`)
      .join("\n");

    const mayorDecision = await callMayor(
      mistral,
      city,
      taxRevenue,
      totalExpenses,
      petitionTexts.join("\n"),
      buildRequestText
    );

    // Store mayor's public message
    const mayor = agents.find((a) => a.role === "mayor");
    if (mayor && mayorDecision.public_message) {
      await ctx.runMutation(internal.simulation.agentMessages.create, {
        senderPlotIndex: mayor.plotIndex,
        senderName: mayor.name,
        content: mayorDecision.public_message.slice(0, 80),
        messageType: "announcement" as const,
        tickNumber,
      });
    }

    // Step 5: Resolve
    // Apply build approvals — fire actual geometry pipeline
    let newBuildsApproved = 0;
    for (const approval of mayorDecision.build_approvals) {
      if (approval.approved && city.activeBuildCount + newBuildsApproved < 4) {
        const req = buildRequests.find((r) => r.agent.plotIndex === approval.agentPlot);
        if (req && req.action.build_description) {
          console.log(`[tick ${tickNumber}] BUILD APPROVED: ${req.agent.name} → "${req.action.build_description}"`);
          newBuildsApproved++;

          // Classify building category via keyword match
          const desc = req.action.build_description.toLowerCase();
          let category = "residential";
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
              category = cat;
              break;
            }
          }

          // Fire the build pipeline asynchronously (don't await — it runs in background)
          ctx.scheduler.runAfter(0, internal.simulation.agentBuild.run, {
            plotIndex: req.agent.plotIndex,
            agentName: req.agent.name,
            buildDescription: req.action.build_description,
            category,
          });
        }
      }
    }

    // Apply tax changes
    const newTaxRates = { ...city.taxRates };
    if (mayorDecision.tax_changes) {
      for (const [key, delta] of Object.entries(mayorDecision.tax_changes)) {
        if (key in newTaxRates) {
          (newTaxRates as any)[key] = Math.max(0, Math.min(0.5, (newTaxRates as any)[key] + delta));
        }
      }
    }

    // Apply budget changes
    const newBudget = { ...city.budgetAllocation };
    if (mayorDecision.budget_changes) {
      for (const [key, delta] of Object.entries(mayorDecision.budget_changes)) {
        if (key in newBudget) {
          (newBudget as any)[key] = Math.max(0, (newBudget as any)[key] + delta);
        }
      }
      // Normalize to sum to 1
      const sum = Object.values(newBudget).reduce((a, b) => a + b, 0);
      if (sum > 0) {
        for (const key of Object.keys(newBudget)) {
          (newBudget as any)[key] = (newBudget as any)[key] / sum;
        }
      }
    }

    // Apply decree
    let newDecree = city.activeDecree;
    if (mayorDecision.decree) {
      newDecree = {
        title: mayorDecision.decree.title,
        description: mayorDecision.decree.description,
        effect: mayorDecision.decree.effect,
        remainingTicks: mayorDecision.decree.duration || 10,
      };
    } else if (newDecree) {
      newDecree = { ...newDecree, remainingTicks: newDecree.remainingTicks - 1 };
      if (newDecree.remainingTicks <= 0) newDecree = undefined as any;
    }

    // Collect taxes + pay expenses + crisis costs
    let newTreasury = city.treasury + taxRevenue - totalExpenses - crisisTreasuryHit;
    let consecutiveBankrupt = city.consecutiveBankruptTicks ?? 0;

    // Broadcast crisis event
    if (crisisMessage && mayor) {
      await ctx.runMutation(internal.simulation.agentMessages.create, {
        senderPlotIndex: mayor.plotIndex,
        senderName: mayor.name,
        content: crisisMessage.slice(0, 80),
        messageType: "announcement" as const,
        tickNumber,
      });
    }
    let bankruptcyPenalty = 0;
    let forceElection = false;
    let cityCollapsed = false;

    // ── BANKRUPTCY ESCALATION SYSTEM ──
    if (newTreasury < 0) {
      consecutiveBankrupt++;
      newTreasury = 0;
      console.log(`[tick ${tickNumber}] BANKRUPTCY (${consecutiveBankrupt} consecutive). Treasury clamped to 0.`);

      // Level 1 (tick 1): Warning + austerity
      if (consecutiveBankrupt >= 1) {
        bankruptcyPenalty = 5 * consecutiveBankrupt; // escalating happiness hit
        // Auto-raise taxes
        newTaxRates.residential = Math.min(0.5, newTaxRates.residential + 0.03);
        newTaxRates.commercial = Math.min(0.5, newTaxRates.commercial + 0.03);
        newTaxRates.industrial = Math.min(0.5, newTaxRates.industrial + 0.03);
        newTaxRates.luxury = Math.min(0.5, newTaxRates.luxury + 0.03);

        if (mayor) {
          await ctx.runMutation(internal.simulation.agentMessages.create, {
            senderPlotIndex: mayor.plotIndex,
            senderName: mayor.name,
            content: consecutiveBankrupt === 1
              ? "WARNING: Treasury empty! Emergency taxes imposed!"
              : `CRISIS (${consecutiveBankrupt} ticks): City still bankrupt!`,
            messageType: "announcement" as const,
            tickNumber,
          });
        }
      }

      // Level 2 (tick 3+): FORCED BUILDING LIQUIDATION — sell cheapest agent building
      if (consecutiveBankrupt >= 3 && allBuildings.length > 0) {
        const buildingValues: Record<string, number> = {
          residential: 800, commercial: 1200, industrial: 1500, office: 1400,
          civic: 500, entertainment: 1000, luxury: 2500,
        };
        // Find cheapest agent building to liquidate
        const agentBuildings = allBuildings.filter((b) => b.ownerId.startsWith("agent:"));
        if (agentBuildings.length > 0) {
          const sorted = [...agentBuildings].sort((a, b) =>
            (buildingValues[a.category ?? "residential"] ?? 800) - (buildingValues[b.category ?? "residential"] ?? 800)
          );
          const victim = sorted[0];
          const salePrice = buildingValues[victim.category ?? "residential"] ?? 800;
          newTreasury += salePrice;

          console.log(`[tick ${tickNumber}] FORCED SALE: Building on plot #${victim.plotIndex} sold for ${salePrice}g`);

          // Delete the building + reset the plot
          await ctx.runMutation(internal.simulation._simBuildHelpers.liquidateBuilding, {
            buildingId: victim._id,
            plotIndex: victim.plotIndex,
          });

          // The agent who lost their building is FURIOUS
          const victimAgent = agents.find((a) => a.plotIndex === victim.plotIndex);
          if (victimAgent) {
            await ctx.runMutation(internal.simulation.agents.update, {
              agentId: victimAgent._id as any,
              patch: {
                satisfaction: Math.max(0, victimAgent.satisfaction - 30),
                loyaltyToMayor: Math.max(-100, victimAgent.loyaltyToMayor - 40),
                buildingCategory: undefined,
                memoryBuffer: [...victimAgent.memoryBuffer, `Tick ${tickNumber}: MY BUILDING WAS SEIZED AND SOLD! I am devastated.`].slice(-5),
              },
            });

            await ctx.runMutation(internal.simulation.agentMessages.create, {
              senderPlotIndex: victimAgent.plotIndex,
              senderName: victimAgent.name,
              content: `They demolished my ${victim.category ?? "building"}! This mayor must go!`,
              messageType: "protest" as const,
              tickNumber,
            });
          }

          if (mayor) {
            await ctx.runMutation(internal.simulation.agentMessages.create, {
              senderPlotIndex: mayor.plotIndex,
              senderName: mayor.name,
              content: `Emergency: Sold ${victimAgent?.name ?? "a citizen"}'s ${victim.category ?? "building"} for ${salePrice}g`,
              messageType: "announcement" as const,
              tickNumber,
            });
          }
        }
      }

      // Level 3 (tick 5): EMERGENCY ELECTION — mayor gets kicked
      if (consecutiveBankrupt >= 5) {
        console.log(`[tick ${tickNumber}] EMERGENCY ELECTION: 5 consecutive bankrupt ticks!`);
        forceElection = true;

        if (mayor) {
          await ctx.runMutation(internal.simulation.agentMessages.create, {
            senderPlotIndex: mayor.plotIndex,
            senderName: mayor.name,
            content: "The people demand change! Emergency election called!",
            messageType: "announcement" as const,
            tickNumber,
          });
        }
      }

      // Level 4 (tick 8): CITY COLLAPSE — simulation ends dramatically
      if (consecutiveBankrupt >= 8) {
        console.log(`[tick ${tickNumber}] CITY COLLAPSE! 8 consecutive bankrupt ticks. Simulation ends.`);
        cityCollapsed = true;

        if (mayor) {
          await ctx.runMutation(internal.simulation.agentMessages.create, {
            senderPlotIndex: mayor.plotIndex,
            senderName: mayor.name,
            content: "KingdomCity has FALLEN. The kingdom is no more.",
            messageType: "announcement" as const,
            tickNumber,
          });
        }
      }
    } else {
      // Not bankrupt — reset counter
      consecutiveBankrupt = 0;
    }

    // Update agents: satisfaction, loyalty, memory
    for (const result of citizenResults) {
      const agent = result.agent;
      const happinessDelta = happiness - city.happiness;
      const newSatisfaction = Math.max(0, Math.min(100,
        agent.satisfaction + happinessDelta * 0.5 + (Math.random() * 6 - 3) - bankruptcyPenalty
      ));

      // Loyalty: petitions responded to → +loyalty, ignored → -loyalty
      const wasApproved = mayorDecision.build_approvals.some(
        (a) => a.agentPlot === agent.plotIndex && a.approved
      );
      const wasDenied = mayorDecision.build_approvals.some(
        (a) => a.agentPlot === agent.plotIndex && !a.approved
      );
      let loyaltyDelta = 0;
      if (wasApproved) loyaltyDelta += 10;
      if (wasDenied) loyaltyDelta -= 5;
      loyaltyDelta += happinessDelta * 0.2;
      if (consecutiveBankrupt > 0) loyaltyDelta -= consecutiveBankrupt * 3; // blame the mayor

      const newLoyalty = Math.max(-100, Math.min(100, agent.loyaltyToMayor + loyaltyDelta));

      // Memory: add latest observation, keep last 5
      const newMemory = [...agent.memoryBuffer];
      if (result.action.message) {
        newMemory.push(`Tick ${tickNumber}: I said "${result.action.message}"`);
      }
      if (mayorDecision.public_message) {
        newMemory.push(`Tick ${tickNumber}: Mayor announced "${mayorDecision.public_message}"`);
      }
      if (consecutiveBankrupt >= 3) {
        newMemory.push(`Tick ${tickNumber}: City bankrupt for ${consecutiveBankrupt} ticks! Buildings being sold!`);
      }
      while (newMemory.length > 5) newMemory.shift();

      await ctx.runMutation(internal.simulation.agents.update, {
        agentId: agent._id as any,
        patch: {
          satisfaction: Math.round(newSatisfaction),
          loyaltyToMayor: Math.round(newLoyalty),
          lastAction: result.action.message || result.action.action,
          lastActionTick: tickNumber,
          memoryBuffer: newMemory,
        },
      });
    }

    // Update city state
    const approvalRating = Math.round(
      agents.reduce((sum, a) => sum + a.satisfaction, 0) / agents.length
    );

    await ctx.runMutation(internal.simulation.cityState.update, {
      patch: {
        treasury: Math.round(newTreasury),
        happiness: Math.round(happiness) - (consecutiveBankrupt > 0 ? consecutiveBankrupt * 2 : 0),
        approvalRating,
        population,
        crimeRate: clamp(Math.round(crimeRate) + crisisCrimeMod, 0, 100),
        pollutionLevel: Math.round(pollutionLevel),
        educationLevel: Math.round(educationLevel * 10) / 10,
        healthLevel: Math.round(healthLevel * 10) / 10,
        taxRates: newTaxRates,
        budgetAllocation: newBudget,
        activeDecree: newDecree || undefined,
        mayorTerm: forceElection ? 0 : city.mayorTerm - 1,
        totalTicks: tickNumber,
        lastTickAt: Date.now(),
        activeBuildCount: city.activeBuildCount + newBuildsApproved,
        consecutiveBankruptTicks: consecutiveBankrupt,
      },
    });

    // Write tick log
    await ctx.runMutation(internal.simulation._tickLogHelpers.create, {
      tickNumber,
      mayorDecision: JSON.stringify(mayorDecision),
      agentsActed: citizenResults.length,
      metricsSnapshot: JSON.stringify({
        population, taxRevenue, expenses: totalExpenses, happiness, crimeRate, pollutionLevel,
        consecutiveBankrupt, treasuryDelta: taxRevenue - totalExpenses - crisisTreasuryHit,
        crisis: crisisMessage || null, inflationMultiplier,
      }),
    });

    console.log(`[tick ${tickNumber}] Done. ${citizenResults.length} agents acted, ${newBuildsApproved} builds approved. Treasury: ${Math.round(newTreasury)} (income: ${taxRevenue}, expenses: ${totalExpenses}${crisisTreasuryHit ? `, crisis: -${crisisTreasuryHit}` : ""}, inflation: ${inflationMultiplier.toFixed(2)}x)`);

    // Step 6: City collapse check
    if (cityCollapsed) {
      console.log(`[tick ${tickNumber}] SIMULATION ENDED — city collapsed.`);
      await ctx.runMutation(internal.simulation.cityState.update, {
        patch: { isRunning: false },
      });
      return; // Don't schedule next tick
    }

    // Step 7: Election check (regular or forced by bankruptcy)
    if (forceElection || city.mayorTerm - 1 <= 0) {
      console.log(`[tick ${tickNumber}] ${forceElection ? "EMERGENCY " : ""}ELECTION TIME!`);
      await ctx.runAction(internal.simulation.tick.runElection, { tickNumber });
    }

    // Step 8: Schedule next tick
    await ctx.scheduler.runAfter(90000, internal.simulation.tick.run, {});
  },
});

// ── Election sub-action ──────────────────────────────────────────────

export const runElection = internalAction({
  args: { tickNumber: v.number() },
  handler: async (ctx, { tickNumber }) => {
    const agents: AgentDoc[] = await ctx.runQuery(internal.simulation.agents.getAllInternal);
    const citizens = agents.filter((a) => a.role === "citizen");

    const votes: Array<{ agentPlot: number; vote: "keep" | "replace"; reason: string }> = [];
    let keepCount = 0;
    let replaceCount = 0;

    for (const citizen of citizens) {
      const threshold = Math.random() * 40 - 20; // random(-20, 20)
      const vote = citizen.loyaltyToMayor > threshold ? "keep" : "replace";
      if (vote === "keep") keepCount++;
      else replaceCount++;
      votes.push({
        agentPlot: citizen.plotIndex,
        vote,
        reason: vote === "keep"
          ? `${citizen.name} supports the mayor (loyalty: ${citizen.loyaltyToMayor})`
          : `${citizen.name} wants change (loyalty: ${citizen.loyaltyToMayor})`,
      });
    }

    const result = keepCount >= replaceCount ? "kept" : "replaced";

    if (result === "replaced") {
      // Pick new mayor: citizen with highest satisfaction
      const sortedByHappiness = [...citizens].sort((a, b) => b.satisfaction - a.satisfaction);
      const newMayor = sortedByHappiness[0];
      const oldMayor = agents.find((a) => a.role === "mayor");

      if (oldMayor) {
        await ctx.runMutation(internal.simulation.agents.update, {
          agentId: oldMayor._id as any,
          patch: { role: "citizen" },
        });
      }
      if (newMayor) {
        await ctx.runMutation(internal.simulation.agents.update, {
          agentId: newMayor._id as any,
          patch: { role: "mayor" },
        });
        await ctx.runMutation(internal.simulation.cityState.update, {
          patch: { currentMayorId: newMayor._id, mayorTerm: 20 },
        });

        await ctx.runMutation(internal.simulation.agentMessages.create, {
          senderPlotIndex: newMayor.plotIndex,
          senderName: newMayor.name,
          content: `I am your new mayor! Long live KingdomCity!`,
          messageType: "announcement" as const,
          tickNumber,
        });
      }

      console.log(`[election] Mayor replaced! New mayor: ${newMayor?.name}`);
    } else {
      await ctx.runMutation(internal.simulation.cityState.update, {
        patch: { mayorTerm: 20 },
      });
      console.log(`[election] Mayor kept!`);
    }

    // Store election record
    await ctx.runMutation(internal.simulation._electionHelpers.create, {
      tickNumber,
      votes,
      result,
      newMayorPersonality: result === "replaced" ? "New mayor takes charge" : undefined,
    });
  },
});
