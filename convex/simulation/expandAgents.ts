"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { Mistral } from "@mistralai/mistralai";
import { withRetry } from "./mistral_retry";

const EXPANSION_NAMES: string[] = [
  "Petra Ironbloom", "Corwin Ashvale", "Daphne Millford", "Ezekiel Runestone",
  "Freya Glasswell", "Hadrian Foxmere", "Ingrid Copperleaf", "Joaquin Driftwood",
  "Katarina Vaultline", "Lysander Heathrow", "Mirabel Dustforge", "Niles Oakthorn",
  "Octavia Silverbrook", "Phineas Galecroft", "Rowena Steepfield", "Sigmund Ashcombe",
  "Thalia Windhollow", "Ulysses Ironmere", "Venetia Cliffton", "Wolfgang Brackenridge",
  "Xiomara Starforge", "Ysolde Thornwall", "Alaric Deepstone", "Brigitte Mosswick",
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
  traits: string[],
): Promise<string> {
  try {
    const response = await withRetry(
      () =>
        mistral.chat.complete({
          model: "mistral-small-latest",
          messages: [
            {
              role: "user",
              content: `Write exactly one sentence (max 30 words) as a backstory for a city simulation citizen named ${name} who is ${traits.join(", ")}. Be creative and specific. No quotes around it.`,
            },
          ],
          maxTokens: 60,
        }),
      `backstory:${name}`,
    );
    const text = response?.choices?.[0]?.message?.content;
    if (typeof text === "string" && text.trim().length > 0) return text.trim();
  } catch (e) {
    console.error(`[expandAgents] Failed backstory for ${name}:`, e);
  }
  return `${name} moved to KingdomCity seeking a fresh start.`;
}

export const run = internalAction({
  args: {},
  handler: async (ctx) => {
    const existingAgents: any[] = await ctx.runQuery(
      internal.simulation.agents.getAllInternal,
    );
    const existingNames = new Set(existingAgents.map((a: any) => a.name));

    // Only expand if we have fewer than 55 agents
    if (existingAgents.length >= 40) {
      console.log(
        `[expandAgents] Already ${existingAgents.length} agents, skipping`,
      );
      return { status: "skipped", agents: existingAgents.length };
    }

    const allPlots: Array<{
      index: number;
      col: number;
      row: number;
      status: string;
    }> = await ctx.runQuery(internal.simulation._plotHelpers.getEmpty);

    // Filter to available names not already in use
    const availableNames = EXPANSION_NAMES.filter(
      (n) => !existingNames.has(n),
    );
    const slotsNeeded = Math.min(availableNames.length, allPlots.length, 24);

    if (slotsNeeded === 0) {
      console.log("[expandAgents] No empty plots or names available");
      return { status: "no_slots", agents: existingAgents.length };
    }

    const selectedPlots = shuffle(allPlots).slice(0, slotsNeeded);
    const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

    let created = 0;
    const BATCH_SIZE = 4;
    const expandNow = Date.now();

    // Generate agents in batches of 4
    for (let batch = 0; batch < Math.ceil(slotsNeeded / BATCH_SIZE); batch++) {
      const batchStart = batch * BATCH_SIZE;
      const batchAgents = selectedPlots.slice(batchStart, batchStart + BATCH_SIZE);

      const backstories = await Promise.all(
        batchAgents.map((plot, i) => {
          const idx = batchStart + i;
          const name = availableNames[idx];
          const traitCount = 3 + Math.floor(Math.random() * 3);
          const traits = pickRandom(ALL_TRAITS, traitCount);
          return generateBackstory(mistral, name, traits).then(
            (backstory) => ({
              plot,
              name,
              traits,
              backstory,
            }),
          );
        }),
      );

      for (const { plot, name, traits, backstory } of backstories) {
        await ctx.runMutation(internal.simulation.agents.create, {
          plotIndex: plot.index,
          name,
          role: "citizen",
          personality: backstory,
          traits,
          wealth: 500 + Math.floor(Math.random() * 500),
          satisfaction: 40 + Math.floor(Math.random() * 30),
          loyaltyToMayor: Math.floor(Math.random() * 40) - 10,
          nextActionAt: expandNow + Math.floor(Math.random() * 60000),
        });

        await ctx.runMutation(internal.simulation._plotHelpers.claimForAgent, {
          plotIndex: plot.index,
          agentName: name,
        });

        created++;
      }

      // Small delay between batches to respect rate limits
      if (batchStart + BATCH_SIZE < slotsNeeded) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    console.log(
      `[expandAgents] Created ${created} new agents (total: ${existingAgents.length + created})`,
    );
    return {
      status: "expanded",
      created,
      total: existingAgents.length + created,
    };
  },
});
