"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { Mistral } from "@mistralai/mistralai";
import { withRetry, resetQuotaFlag } from "./mistral_retry";
import { AgentDoc, CityStateDoc, detectBuildCategory } from "./_agentPrompts";

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

// ── Mayor prompt ─────────────────────────────────────────────────────

function buildMayorPrompt(
  city: CityStateDoc,
  income: number,
  expenses: number,
  petitions: string,
  buildRequests: string
): string {
  const isLive = city.simMode === "live";
  const buildCap = isLive ? 12 : 2;
  const slotsAvailable = Math.max(0, buildCap - city.activeBuildCount);
  const treasuryWarning = city.treasury < 2000
    ? `\n⚠️ TREASURY CRITICAL: Only $${city.treasury} left! Treasury CANNOT go below 0. If expenses exceed income, emergency austerity kicks in. Consider raising taxes or cutting budget.`
    : "";

  return `You are King Mistral, ruler of KingdomCity. You have 40 citizens on 40 plots.
Each plot can hold up to 8 buildings arranged around the perimeter. Citizens can build multiple buildings to develop their plots.

City state:
- Treasury: $${city.treasury} (income: $${income}/tick, expenses: $${expenses}/tick, net: $${income - expenses}/tick)
- Happiness: ${city.happiness}/100, Crime: ${city.crimeRate}/100, Pollution: ${city.pollutionLevel}/100
- Approval rating: ${city.approvalRating}/100
- Builds in progress: ${city.activeBuildCount}/${buildCap} — ${slotsAvailable} slots available${city.activeBuildCount >= buildCap ? "\n  🚫 ALL BUILD SLOTS FULL. You MUST deny all build requests this tick." : isLive ? `\n  🏗️ GROWTH MODE is active! You should approve most build requests — the city thrives when citizens build. Only deny if clearly harmful.` : "\n  Each build takes 1-3 minutes. Build slots are precious. Be selective."}
  ${isLive ? "Buildings generate income and make citizens happy. More buildings = a thriving city. Be generous with approvals!" : "Think strategically: what does the city NEED most? Revenue buildings (commercial, industrial, luxury) or population/happiness (residential, civic, entertainment)?\n  ECONOMICS: Buildings generate base income automatically. Taxes add citizen revenue on top. But maintenance grows QUADRATICALLY — more buildings = exponentially higher costs. You MUST balance growth with fiscal discipline."}
- Current tax rates: res ${Math.round(city.taxRates.residential * 100)}%, com ${Math.round(city.taxRates.commercial * 100)}%, ind ${Math.round(city.taxRates.industrial * 100)}%, lux ${Math.round(city.taxRates.luxury * 100)}%
  WARNING: Taxes above 20% trigger tax fatigue (evasion). Above 30% citizens get unhappy. But too low = deficit!
- Budget: edu ${Math.round(city.budgetAllocation.education * 100)}%, health ${Math.round(city.budgetAllocation.healthcare * 100)}%, security ${Math.round(city.budgetAllocation.security * 100)}%, infra ${Math.round(city.budgetAllocation.infrastructure * 100)}%
- Trade port: Level ${city.tradeStats?.portLevel ?? 1}, multiplier: ${city.tradeStats?.tradeMultiplier?.toFixed(1) ?? "1.0"}x, ships docked: ${city.tradeStats?.totalShipsDocked ?? 0}
  TIP: More industrial/commercial/office buildings boost your trade multiplier, attracting richer ships!
- Active decree: ${city.activeDecree?.title ?? "none"}
- Next election in: ${city.mayorTerm} ticks${treasuryWarning}

Citizen petitions this tick:
${petitions || "None."}

Pending build requests:
${buildRequests || "None."}

You must decide:
1. APPROVE or DENY each build request (you have ${slotsAvailable} slots available${isLive ? " — approve generously! The city needs rapid growth!" : " — be selective! Prioritize what the city needs most"})
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
    maxTokens: 800,
    temperature: 0.7,
    responseFormat: { type: "json_object" },
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
    const raw = JSON.parse(text);

    // Normalize build_approvals: force correct types
    const approvals: MayorDecision["build_approvals"] = [];
    if (Array.isArray(raw.build_approvals)) {
      for (const a of raw.build_approvals) {
        approvals.push({
          agentPlot: Number(a.agentPlot ?? a.agent_plot ?? a.plot ?? 0),
          approved: a.approved === true || a.approved === "true",
          reason: String(a.reason ?? ""),
        });
      }
    }

    // Enforce build cap
    const isLiveMode = city.simMode === "live";
    const cap = isLiveMode ? 12 : 4;
    let remainingSlots = cap - city.activeBuildCount;
    for (const approval of approvals) {
      if (remainingSlots <= 0) {
        approval.approved = false;
        approval.reason = `Build queue full (${cap}/${cap})`;
      } else if (approval.approved) {
        remainingSlots--;
      }
    }

    // Normalize tax changes
    const taxChanges: Record<string, number> | null =
      raw.tax_changes && typeof raw.tax_changes === "object"
        ? Object.fromEntries(
            Object.entries(raw.tax_changes).map(([k, v]) => [k, Math.max(-0.02, Math.min(0.02, Number(v)))])
          )
        : null;

    const parsed: MayorDecision = {
      build_approvals: approvals,
      tax_changes: taxChanges,
      budget_changes: raw.budget_changes ?? null,
      decree: raw.decree ?? null,
      public_message: String(raw.public_message ?? "").slice(0, 80),
      mood: String(raw.mood ?? "concerned"),
    };

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

// ── Main city tick engine ────────────────────────────────────────────

export const run = internalAction({
  args: {},
  handler: async (ctx) => {
    // Step 1: Snapshot
    const city: CityStateDoc | null = await ctx.runQuery(internal.simulation.cityState.getInternal);
    if (!city || !city.isRunning) {
      console.log("[tick] Simulation not running, stopping");
      return;
    }

    const tickNumber = city.totalTicks + 1;

    // Bootstrap agent tick chain if not running (self-healing after deploy)
    if (!city.nextAgentTickId) {
      console.log(`[tick ${tickNumber}] Agent tick chain not running, bootstrapping...`);
      const agentTickId = await ctx.scheduler.runAfter(2000, internal.simulation.agentTick.run, {});
      await ctx.runMutation(internal.simulation.cityState.update, {
        patch: { nextAgentTickId: agentTickId },
      });
    }

    try {
    const agents: AgentDoc[] = await ctx.runQuery(internal.simulation.agents.getAllInternal);
    const mistral = getMistral();

    // Reconcile activeBuildCount with ground truth (count "generating" plots).
    // Prevents permanent drift from missed onBuildComplete/onBuildFailed calls.
    const actualGenerating: number = await ctx.runQuery(internal.plots.countGenerating, {});
    if (city.activeBuildCount !== actualGenerating) {
      console.log(`[tick ${tickNumber}] Reconciling activeBuildCount: ${city.activeBuildCount} → ${actualGenerating}`);
      await ctx.runMutation(internal.simulation.cityState.update, {
        patch: { activeBuildCount: actualGenerating },
      });
      city.activeBuildCount = actualGenerating;
    }

    console.log(`[tick ${tickNumber}] Starting...`);
    resetQuotaFlag(); // fresh chance each tick


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
      civic: 10, entertainment: 50, luxury: 120,
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
    const baseUpkeep = Math.round(population * 0.06);
    const budgetTotal = budget.education + budget.healthcare + budget.security + budget.infrastructure;
    const serviceCosts = Math.round(budgetTotal * population * 0.12);
    const maintenanceCost = Math.round(totalBuildings * 12 + Math.max(0, totalBuildings - 10) * totalBuildings * 0.3);
    const inflationMultiplier = 1 + Math.floor(tickNumber / 10) * 0.01;
    const totalExpenses = Math.round((baseUpkeep + serviceCosts + maintenanceCost) * inflationMultiplier);

    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

    // ── TREASURY STRESS: when money is low, can't fund services → crime rises ──
    // Below $5000 treasury, crime starts creeping up. At $0 → +25 crime.
    const treasuryStress = Math.max(0, 1 - city.treasury / 3000) * 15;
    const crimeRate = clamp(12 + census.industrial * 8 - census.civic * 15 - budget.security * 50 + treasuryStress, 0, 100);
    const pollutionLevel = clamp(10 + census.industrial * 12 + census.commercial * 3 - budget.infrastructure * 20, 0, 100);
    const educationLevel = clamp(20 + census.civic * 10 + budget.education * 60, 0, 100);
    const healthLevel = clamp(20 + census.civic * 8 + budget.healthcare * 60, 0, 100);

    // High taxes reduce happiness (citizens feel the burden)
    const taxBurden = avgTaxRate > 0.3 ? (avgTaxRate - 0.3) * 30 : 0;

    // ── RANDOM EVENTS (6% chance per tick — 3% negative, 3% positive) ──
    let crisisMessage = "";
    let crisisHappinessMod = 0;
    let crisisTreasuryHit = 0;
    let crisisCrimeMod = 0;
    const crisisRoll = Math.random();
    if (crisisRoll < 0.01) {
      // Crime wave — 1% chance
      crisisCrimeMod = 15;
      crisisHappinessMod = -8;
      crisisMessage = "A crime wave has swept through the city! Citizens live in fear.";
      console.log(`[tick ${tickNumber}] CRISIS: Crime wave!`);
    } else if (crisisRoll < 0.02) {
      // Epidemic — 1% chance (halved cost from pop*0.5 to pop*0.2)
      crisisHappinessMod = -10;
      crisisTreasuryHit = Math.round(population * 0.2);
      crisisMessage = "An epidemic is spreading! Healthcare costs skyrocket.";
      console.log(`[tick ${tickNumber}] CRISIS: Epidemic! Treasury hit: ${crisisTreasuryHit}`);
    } else if (crisisRoll < 0.03) {
      // Industrial accident — 1% chance (only if industrial buildings exist, halved cost)
      if (census.industrial > 0) {
        crisisHappinessMod = -5;
        crisisTreasuryHit = Math.round(census.industrial * 100);
        crisisMessage = "An industrial accident has occurred! Cleanup costs are massive.";
        console.log(`[tick ${tickNumber}] CRISIS: Industrial accident! Cost: ${crisisTreasuryHit}`);
      }
    } else if (crisisRoll < 0.06) {
      // Foreign delegation — 3% chance (positive event, boosts trade multiplier)
      crisisHappinessMod = 5;
      crisisMessage = "A foreign delegation has arrived! Trade relations flourish!";
      console.log(`[tick ${tickNumber}] EVENT: Foreign delegation! Trade multiplier boosted for 5 ticks.`);
    }

    // ── TRADE SHIP SYSTEM ──
    const prevTradeStats = city.tradeStats ?? {
      totalShipsDocked: 0, totalTradeIncome: 0, lastShipTick: 0, portLevel: 1, tradeMultiplier: 1.0,
    };

    // Foreign delegation bonus: +0.5 multiplier for 5 ticks after event
    const delegationBonus = (crisisMessage.includes("foreign delegation")) ? 0.5 : 0;

    // Trade multiplier based on building types
    const tradeMultiplier = +(1.0 + census.industrial * 0.25 + census.commercial * 0.15 + census.office * 0.1 + delegationBonus).toFixed(2);

    // Port level: Lv1 start → Lv2 after 10 ships → Lv3 after 25 ships
    const portLevel = prevTradeStats.totalShipsDocked >= 25 ? 3 : prevTradeStats.totalShipsDocked >= 10 ? 2 : 1;

    // Ship frequency: Lv1=25%, Lv2=33%, Lv3=50%. Guaranteed if 6+ ticks since last ship.
    const shipChance = portLevel === 3 ? 0.5 : portLevel === 2 ? 0.33 : 0.25;
    const ticksSinceShip = tickNumber - prevTradeStats.lastShipTick;
    const shipDocks = ticksSinceShip >= 6 || Math.random() < shipChance;

    let tradeTreasuryIncome = 0;
    let tradeWagePool = 0;
    let tradeShipMessage = "";

    if (shipDocks) {
      const cargoValue = Math.round((200 + Math.random() * 300) * portLevel * tradeMultiplier);
      tradeTreasuryIncome = Math.round(cargoValue * 0.7);
      tradeWagePool = Math.round(cargoValue * 0.3);

      const flavorMessages = [
        `A trade ship just docked! ${cargoValue}g in cargo revenue!`,
        `Merchant vessel arrived with ${cargoValue}g worth of exotic goods!`,
        `Trade ship unloading! ${cargoValue}g flows into our economy!`,
        `The port bustles as a cargo ship brings ${cargoValue}g in trade!`,
      ];
      tradeShipMessage = flavorMessages[Math.floor(Math.random() * flavorMessages.length)];
      console.log(`[tick ${tickNumber}] TRADE SHIP: ${cargoValue}g cargo (treasury: +${tradeTreasuryIncome}, wages: +${tradeWagePool})`);
    }

    const newTradeStats = {
      totalShipsDocked: prevTradeStats.totalShipsDocked + (shipDocks ? 1 : 0),
      totalTradeIncome: prevTradeStats.totalTradeIncome + tradeTreasuryIncome,
      lastShipTick: shipDocks ? tickNumber : prevTradeStats.lastShipTick,
      portLevel,
      tradeMultiplier,
    };

    // ── AGENT WAGES & SPENDING ──
    const wageMap: Record<string, number> = {
      luxury: 45, industrial: 40, office: 35, commercial: 30,
      entertainment: 25, civic: 20, residential: 15,
    };
    const tradeEligible = new Set(["industrial", "commercial", "office"]);

    // Count trade-eligible workers for wage pool distribution
    const tradeWorkerCount = agents.filter((a) => a.isActive && a.role === "citizen" && tradeEligible.has(a.buildingCategory ?? "")).length;

    const perWorkerTradeBonus = tradeWorkerCount > 0 ? Math.round(tradeWagePool / tradeWorkerCount) : 0;

    let totalConsumptionTax = 0;
    const agentWageUpdates: Array<{ agentId: string; income: number; totalEarned: number; wealth: number; jobType: string }> = [];

    for (const agent of agents) {
      if (!agent.isActive || agent.role !== "citizen") continue;

      const cat = agent.buildingCategory ?? "residential";
      const baseWage = wageMap[cat] ?? 5;
      const educBonus = 1 + (educationLevel / 200); // up to 1.5x
      let tickIncome = Math.round(baseWage * educBonus);

      // Trade bonus for eligible workers
      if (shipDocks && tradeEligible.has(cat)) {
        tickIncome += perWorkerTradeBonus;
      }

      // Spending: 30-60% of income, keep 200g safety floor
      const spendRate = 0.3 + Math.random() * 0.3;
      const potentialSpend = Math.round(tickIncome * spendRate);
      const currentWealth = agent.wealth + tickIncome;
      const actualSpend = currentWealth - potentialSpend >= 200 ? potentialSpend : Math.max(0, currentWealth - 200);

      // Consumption tax on spending
      const consumptionTax = Math.round(actualSpend * avgTaxRate);
      totalConsumptionTax += consumptionTax;

      const newWealth = currentWealth - actualSpend;
      const prevTotalEarned = agent.totalEarned ?? 0;

      agentWageUpdates.push({
        agentId: agent._id,
        income: tickIncome,
        totalEarned: prevTotalEarned + tickIncome,
        wealth: Math.round(newWealth),
        jobType: cat,
      });
    }

    const happiness = clamp(
      50 + census.entertainment * 5 - crimeRate * 0.3 - pollutionLevel * 0.2 +
      educationLevel * 0.1 + healthLevel * 0.15 - taxBurden + crisisHappinessMod,
      0, 100
    );

    // Step 3: Collect pending build requests from agent docs (set by agentTick)
    const citizens = agents.filter((a) => a.role === "citizen" && a.isActive);
    const isLive = city.simMode === "live";

    // Build a map of building count per plot
    const plotBuildingCounts: Record<number, number> = {};
    for (const b of allBuildings) {
      plotBuildingCounts[b.plotIndex] = (plotBuildingCounts[b.plotIndex] ?? 0) + 1;
    }

    // Collect pending build requests from agents
    const buildRequests: Array<{ agent: AgentDoc; buildDescription: string }> = [];
    for (const agent of citizens) {
      if (agent.pendingBuildDescription) {
        buildRequests.push({
          agent,
          buildDescription: agent.pendingBuildDescription,
        });
      }
    }

    // Collect petitions/protests from recent agent messages since last city tick
    const recentMessages: Array<{
      senderPlotIndex: number;
      senderName: string;
      content: string;
      messageType: string;
      tickNumber: number;
    }> = await ctx.runQuery(internal.simulation.agentMessages.getRecentInternal, {
      afterTick: Math.max(0, tickNumber - 1),
    });
    const petitionTexts: string[] = [];
    for (const msg of recentMessages) {
      if (msg.messageType === "petition" || msg.messageType === "protest") {
        petitionTexts.push(`${msg.senderName} (plot #${msg.senderPlotIndex}): ${msg.content}`);
      }
    }

    console.log(`[tick ${tickNumber}] ${buildRequests.length} pending builds, ${petitionTexts.length} petitions`);

    // Step 4: Mayor decision
    const buildRequestText = buildRequests
      .map((r) => `${r.agent.name} (plot #${r.agent.plotIndex}): wants to build "${r.buildDescription}"`)
      .join("\n");

    const mayorDecision = await withRetry(
      () => callMayor(
        mistral,
        city,
        taxRevenue,
        totalExpenses,
        petitionTexts.join("\n"),
        buildRequestText,
      ),
      "mayor",
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
    const buildCap = isLive ? 12 : 2;

    // Debug: log what the mayor returned vs what we have
    console.log(`[tick ${tickNumber}] Mayor approvals: ${JSON.stringify(mayorDecision.build_approvals)}`);
    console.log(`[tick ${tickNumber}] Build request plots: [${buildRequests.map(r => r.agent.plotIndex).join(", ")}]`);

    // Process build requests — stagger scheduling 3s apart
    const approvedBuilds: Array<{ agent: AgentDoc; buildDescription: string }> = [];

    // Per-plot building cap
    const MAX_BUILDINGS_PER_PLOT = 9;

    if (isLive && buildRequests.length > 0) {
      // Live mode: approve all build requests directly
      for (const req of buildRequests) {
        if (city.activeBuildCount + newBuildsApproved >= buildCap) break;
        if ((plotBuildingCounts[req.agent.plotIndex] ?? 0) >= MAX_BUILDINGS_PER_PLOT) {
          console.log(`[tick ${tickNumber}] BUILD DENIED (plot #${req.agent.plotIndex} full, ${MAX_BUILDINGS_PER_PLOT} max): ${req.agent.name}`);
          continue;
        }
        console.log(`[tick ${tickNumber}] BUILD APPROVED (live): ${req.agent.name} → "${req.buildDescription}"`);
        newBuildsApproved++;
        approvedBuilds.push(req);
        plotBuildingCounts[req.agent.plotIndex] = (plotBuildingCounts[req.agent.plotIndex] ?? 0) + 1;
      }
    }

    if (!isLive && buildRequests.length > 0) {
      // Overnight mode: random 50% approval, cap at 2
      const overnightBuildCap = 2;
      for (const req of buildRequests) {
        if (city.activeBuildCount + newBuildsApproved >= overnightBuildCap) break;
        if ((plotBuildingCounts[req.agent.plotIndex] ?? 0) >= MAX_BUILDINGS_PER_PLOT) {
          console.log(`[tick ${tickNumber}] BUILD DENIED (plot #${req.agent.plotIndex} full, ${MAX_BUILDINGS_PER_PLOT} max): ${req.agent.name}`);
          continue;
        }
        if (Math.random() > 0.5) {
          console.log(`[tick ${tickNumber}] BUILD DENIED (overnight random): ${req.agent.name}`);
          continue;
        }
        console.log(`[tick ${tickNumber}] BUILD APPROVED (overnight): ${req.agent.name} → "${req.buildDescription}"`);
        newBuildsApproved++;
        approvedBuilds.push(req);
        plotBuildingCounts[req.agent.plotIndex] = (plotBuildingCounts[req.agent.plotIndex] ?? 0) + 1;
      }
    }

    // Schedule builds staggered 3s apart
    for (let i = 0; i < approvedBuilds.length; i++) {
      const req = approvedBuilds[i];
      const category = detectBuildCategory(req.buildDescription);
      ctx.scheduler.runAfter(i * 3000, internal.simulation.agentBuild.run, {
        plotIndex: req.agent.plotIndex,
        agentName: req.agent.name,
        buildDescription: req.buildDescription,
        category,
        tickNumber,
        skipReuse: !isLive ? true : undefined,
      });
    }

    // Clear pendingBuildDescription on all agents that had one
    for (const req of buildRequests) {
      await ctx.runMutation(internal.simulation.agents.update, {
        agentId: req.agent._id as any,
        patch: { pendingBuildDescription: undefined },
      });
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

    // Collect taxes + pay expenses + crisis costs + trade income + consumption tax
    let newTreasury = city.treasury + taxRevenue + tradeTreasuryIncome + totalConsumptionTax - totalExpenses - crisisTreasuryHit;
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
    // Broadcast trade ship event
    if (tradeShipMessage && mayor) {
      await ctx.runMutation(internal.simulation.agentMessages.create, {
        senderPlotIndex: mayor.plotIndex,
        senderName: mayor.name,
        content: tradeShipMessage.slice(0, 80),
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
        // Auto-raise taxes (gentle: +1% capped at 30% to avoid tax fatigue death spiral)
        newTaxRates.residential = Math.min(0.3, newTaxRates.residential + 0.01);
        newTaxRates.commercial = Math.min(0.3, newTaxRates.commercial + 0.01);
        newTaxRates.industrial = Math.min(0.3, newTaxRates.industrial + 0.01);
        newTaxRates.luxury = Math.min(0.3, newTaxRates.luxury + 0.01);

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

      // Level 2 (tick 3+): Log bankruptcy warning (no longer liquidates buildings)
      if (consecutiveBankrupt >= 3) {
        console.log(`[tick ${tickNumber}] BANKRUPTCY level 2 (${consecutiveBankrupt} ticks) — no liquidation.`);
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

    // Update ALL active agents: satisfaction, loyalty, memory, wages
    // Track which agents had builds approved/denied this city tick
    const approvedPlots = new Set(approvedBuilds.map((r) => r.agent.plotIndex));
    const deniedPlots = new Set(
      buildRequests
        .filter((r) => !approvedBuilds.some((a) => a.agent._id === r.agent._id))
        .map((r) => r.agent.plotIndex),
    );

    // Build a lookup for wage updates
    const wageUpdateMap = new Map(agentWageUpdates.map((u) => [u.agentId, u]));

    for (const agent of citizens) {
      const happinessDelta = happiness - city.happiness;
      const newSatisfaction = Math.max(0, Math.min(100,
        agent.satisfaction + happinessDelta * 0.5 + (Math.random() * 6 - 3) - bankruptcyPenalty
      ));

      let loyaltyDelta = 0;
      if (approvedPlots.has(agent.plotIndex)) loyaltyDelta += 10;
      if (deniedPlots.has(agent.plotIndex)) loyaltyDelta -= 5;
      loyaltyDelta += happinessDelta * 0.2;
      if (consecutiveBankrupt > 0) loyaltyDelta -= consecutiveBankrupt * 3;

      const newLoyalty = Math.max(-100, Math.min(100, agent.loyaltyToMayor + loyaltyDelta));

      // Memory: add mayor announcement if any
      const newMemory = [...agent.memoryBuffer];
      if (mayorDecision.public_message) {
        newMemory.push(`Tick ${tickNumber}: Mayor announced "${mayorDecision.public_message}"`);
      }
      if (consecutiveBankrupt >= 3) {
        newMemory.push(`Tick ${tickNumber}: City bankrupt for ${consecutiveBankrupt} ticks! Buildings being sold!`);
      }
      if (tradeShipMessage) {
        newMemory.push(`Tick ${tickNumber}: ${tradeShipMessage}`);
      }
      while (newMemory.length > 5) newMemory.shift();

      // Merge wage update if available
      const wageUpdate = wageUpdateMap.get(agent._id);
      const wagePatch = wageUpdate ? {
        wealth: wageUpdate.wealth,
        income: wageUpdate.income,
        totalEarned: wageUpdate.totalEarned,
        jobType: wageUpdate.jobType,
      } : {};

      // Remove from map so we don't double-apply
      wageUpdateMap.delete(agent._id);

      await ctx.runMutation(internal.simulation.agents.update, {
        agentId: agent._id as any,
        patch: {
          satisfaction: Math.round(newSatisfaction),
          loyaltyToMayor: Math.round(newLoyalty),
          memoryBuffer: newMemory,
          ...wagePatch,
        },
      });
    }

    // Apply wage updates for agents not in citizenResults (inactive this tick but still earn wages)
    for (const [agentId, wageUpdate] of wageUpdateMap) {
      await ctx.runMutation(internal.simulation.agents.update, {
        agentId: agentId as any,
        patch: {
          wealth: wageUpdate.wealth,
          income: wageUpdate.income,
          totalEarned: wageUpdate.totalEarned,
          jobType: wageUpdate.jobType,
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
        tradeStats: newTradeStats,
      },
    });

    // Write tick log
    await ctx.runMutation(internal.simulation._tickLogHelpers.create, {
      tickNumber,
      mayorDecision: JSON.stringify(mayorDecision),
      agentsActed: citizens.length,
      metricsSnapshot: JSON.stringify({
        population, taxRevenue, expenses: totalExpenses, happiness, crimeRate, pollutionLevel,
        consecutiveBankrupt, treasuryDelta: taxRevenue + tradeTreasuryIncome + totalConsumptionTax - totalExpenses - crisisTreasuryHit,
        crisis: crisisMessage || null, inflationMultiplier,
        tradeIncome: tradeTreasuryIncome, consumptionTax: totalConsumptionTax,
        shipDocked: shipDocks, portLevel, tradeMultiplier,
      }),
    });

    console.log(`[tick ${tickNumber}] Done. ${newBuildsApproved} builds approved. Treasury: ${Math.round(newTreasury)} (income: ${taxRevenue}, trade: +${tradeTreasuryIncome}, consTax: +${totalConsumptionTax}, expenses: ${totalExpenses}${crisisTreasuryHit ? `, crisis: -${crisisTreasuryHit}` : ""}, inflation: ${inflationMultiplier.toFixed(2)}x) Port Lv${portLevel} Trade ${tradeMultiplier}x${shipDocks ? " SHIP DOCKED" : ""}`);


    // Step 6: City collapse → bailout (sim never stops)
    if (cityCollapsed) {
      console.log(`[tick ${tickNumber}] CITY BAILOUT — treasury reset to 8000, bankruptcy cleared, taxes reset, happiness degraded.`);
      // Reset taxes back to sane defaults so the new mayor isn't crippled by fatigue
      newTaxRates.residential = 0.10;
      newTaxRates.commercial = 0.10;
      newTaxRates.industrial = 0.15;
      newTaxRates.luxury = 0.20;
      await ctx.runMutation(internal.simulation.cityState.update, {
        patch: {
          treasury: 8000,
          taxRates: newTaxRates,
          consecutiveBankruptTicks: 0,
          activeBuildCount: 0,
          happiness: Math.max(10, Math.round(happiness) - 20),
        },
      });
    }

    // Step 7: Election check (regular or forced by bankruptcy)
    if (forceElection || city.mayorTerm - 1 <= 0) {
      console.log(`[tick ${tickNumber}] ${forceElection ? "EMERGENCY " : ""}ELECTION TIME!`);
      await ctx.runAction(internal.simulation.tick.runElection, { tickNumber });
    }

    } catch (err) {
      console.error(`[tick ${tickNumber}] CRASHED:`, err);
      // Update lastTickAt so ensureRunning doesn't double-recover
      await ctx.runMutation(internal.simulation.cityState.update, {
        patch: { lastTickAt: Date.now() },
      });
    }

    // ALWAYS schedule next city tick — even after a crash
    const freshCity = await ctx.runQuery(internal.simulation.cityState.getInternal);
    const currentMode = freshCity?.simMode ?? "overnight";
    const cityTickInterval = currentMode === "live" ? 10000 : 300000;
    const nextCityTickId = await ctx.scheduler.runAfter(cityTickInterval, internal.simulation.tick.run, {});
    // Store the scheduled ID so setSimMode can cancel + reschedule
    await ctx.runMutation(internal.simulation.cityState.update, {
      patch: { nextCityTickId },
    });
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
