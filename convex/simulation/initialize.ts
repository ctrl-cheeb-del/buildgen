"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { Mistral } from "@mistralai/mistralai";

const AGENT_NAMES: string[] = [
  "Ada Ironwright", "Barnaby Soot", "Cecilia Windmere", "Dmitri Brassov",
  "Elena Foxglove", "Finnegan Cork", "Greta Ashdown", "Hugo Tidewell",
  "Iris Cobblestone", "Jasper Flint", "Kira Moonvale", "Leopold Crane",
  "Marta Ember", "Nikolai Dusk", "Ophelia Birch", "Percy Goldthwaite",
  "Quinn Ravenshaw", "Rosa Steelhand", "Silas Thornbury", "Tabitha Wren",
  "Ulric Hammerfell", "Violet Ashmore", "Walter Bridgeford", "Xenia Starfall",
  "Yuri Coppermine", "Zelda Hearthstone", "Amos Blackwell", "Blythe Fairweather",
  "Cassius Redoak", "Delphine Chalk", "Edwin Stonegate", "Flora Brightwater",
  "Gideon Rust", "Helena Sunridge", "Ivan Mortar", "Juniper Claye",
  "Knox Warbleton", "Liora Deepwell", "Magnus Ashford", "Nell Sparrowhawk",
];

const ALL_TRAITS: string[] = [
  "industrious", "lazy", "greedy", "generous", "frugal", "extravagant",
  "gregarious", "reclusive", "charismatic", "bitter", "empathetic", "callous",
  "patriotic", "anarchist", "reformist", "traditionalist", "progressive", "apathetic",
  "anxious", "stoic", "optimistic", "paranoid", "contrarian", "sycophantic",
  "capitalist", "socialist", "environmentalist", "militarist", "pacifist", "nostalgic",
];

function pickRandom<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function generateBackstory(
  mistral: Mistral,
  name: string,
  traits: string[]
): Promise<string> {
  try {
    const response = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages: [
        {
          role: "user",
          content: `Write exactly one sentence (max 30 words) as a backstory for a city simulation citizen named ${name} who is ${traits.join(", ")}. Be creative and specific. No quotes around it.`,
        },
      ],
      maxTokens: 60,
    });
    const text = response?.choices?.[0]?.message?.content;
    if (typeof text === "string" && text.trim().length > 0) return text.trim();
  } catch (e) {
    console.error(`[init] Failed backstory for ${name}:`, e);
  }
  return `${name} moved to KingdomCity seeking a fresh start.`;
}

export const run = internalAction({
  args: {},
  handler: async (ctx) => {
    // Check if already initialized
    const existingAgents: any[] = await ctx.runQuery(internal.simulation.agents.getAllInternal);
    if (existingAgents && existingAgents.length > 0) {
      console.log("[init] Already initialized, skipping");
      return { status: "already_initialized", agents: existingAgents.length };
    }

    const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

    // Get all plots, pick 40 empty ones
    const allPlots: Array<{ index: number; col: number; row: number; status: string }> =
      await ctx.runQuery(internal.simulation._plotHelpers.getEmpty);
    if (allPlots.length < 40) {
      throw new Error(`Need 40 empty plots, only ${allPlots.length} available`);
    }
    const selectedPlots = shuffle(allPlots).slice(0, 40);

    // Generate agents in batches of 8 to avoid rate limits
    const agentIds: string[] = [];
    let mayorIdx = -1;
    let mayorId: string | null = null;

    for (let batch = 0; batch < 5; batch++) {
      const batchStart = batch * 8;
      const batchAgents = selectedPlots.slice(batchStart, batchStart + 8);

      const backstories = await Promise.all(
        batchAgents.map((plot, i) => {
          const idx = batchStart + i;
          const name = AGENT_NAMES[idx];
          const traitCount = 3 + Math.floor(Math.random() * 3); // 3-5
          const traits = pickRandom(ALL_TRAITS, traitCount);
          return generateBackstory(mistral, name, traits).then((backstory) => ({
            plot,
            name,
            traits,
            backstory,
            idx,
          }));
        })
      );

      for (const { plot, name, traits, backstory, idx } of backstories) {
        const isCharismatic = traits.includes("charismatic");
        if (isCharismatic && mayorIdx === -1) mayorIdx = idx;

        const id = await ctx.runMutation(internal.simulation.agents.create, {
          plotIndex: plot.index,
          name,
          role: "citizen",
          personality: backstory,
          traits,
          wealth: 500 + Math.floor(Math.random() * 500),
          satisfaction: 40 + Math.floor(Math.random() * 30),
          loyaltyToMayor: Math.floor(Math.random() * 40) - 10,
        });
        agentIds.push(id);

        // Claim plot for agent
        await ctx.runMutation(internal.simulation._plotHelpers.claimForAgent, {
          plotIndex: plot.index,
          agentName: name,
        });
      }
    }

    // Pick mayor: first charismatic, or random
    if (mayorIdx === -1) mayorIdx = Math.floor(Math.random() * 40);
    mayorId = agentIds[mayorIdx];

    await ctx.runMutation(internal.simulation.agents.update, {
      agentId: mayorId as any,
      patch: { role: "mayor" },
    });

    // Create city state
    await ctx.runMutation(internal.simulation.cityState.create, {
      treasury: 10000,
      happiness: 50,
      approvalRating: 60,
      population: 200,
      crimeRate: 20,
      pollutionLevel: 10,
      educationLevel: 20,
      healthLevel: 20,
      taxRates: { residential: 0.1, commercial: 0.1, industrial: 0.15, luxury: 0.2 },
      budgetAllocation: { education: 0.25, healthcare: 0.25, security: 0.25, infrastructure: 0.25 },
      currentMayorId: mayorId as any,
      mayorTerm: 20,
    });

    console.log(`[init] Created ${agentIds.length} agents, mayor: ${AGENT_NAMES[mayorIdx]}`);
    return { status: "initialized", agents: agentIds.length, mayor: AGENT_NAMES[mayorIdx] };
  },
});
