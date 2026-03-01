"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { Mistral } from "@mistralai/mistralai";

interface Highlight {
  tick: number;
  headline: string;
  detail: string;
  type: "crisis" | "building" | "election" | "decree" | "milestone" | "drama";
}

export const summarizeReplay = action({
  args: { afterTick: v.number(), upToTick: v.number() },
  handler: async (ctx, { afterTick, upToTick }): Promise<Highlight[]> => {
    // Gather replay data via internal queries
    const [messages, tickLogs, buildings, elections] = await Promise.all([
      ctx.runQuery(internal.simulation.agentMessages.getRange, {
        afterTick,
        upToTick,
      }),
      ctx.runQuery(internal.simulation.replay.getTickLogsInternal, {
        afterTick,
        upToTick,
      }),
      ctx.runQuery(internal.simulation.replay.getBuildingsInternal, {
        afterTick,
        upToTick,
      }),
      ctx.runQuery(internal.simulation.replay.getElectionsInternal, {
        afterTick,
        upToTick,
      }),
    ]);

    // Build context for the LLM
    const announcements = (messages as any[])
      .filter((m) => m.messageType === "announcement" || m.messageType === "protest")
      .slice(0, 20)
      .map((m) => `T${m.tickNumber} [${m.messageType}] ${m.senderName}: ${m.content}`)
      .join("\n");

    const buildList = (buildings as any[])
      .slice(0, 15)
      .map((b) => `T${b.createdAtTick}: "${b.prompt}" on plot #${b.plotIndex}`)
      .join("\n");

    const electionList = (elections as any[])
      .map((e) => `T${e.tickNumber}: Election result = ${e.result}`)
      .join("\n");

    const crises = (tickLogs as any[])
      .filter((l) => {
        try {
          const snap = JSON.parse(l.metricsSnapshot);
          return snap.crisis;
        } catch {
          return false;
        }
      })
      .slice(0, 5)
      .map((l) => {
        const snap = JSON.parse(l.metricsSnapshot);
        return `T${l.tickNumber}: ${snap.crisis}`;
      })
      .join("\n");

    const prompt = `You are summarizing what happened in a city simulation between tick ${afterTick} and ${upToTick}.

Key events:
ANNOUNCEMENTS & PROTESTS:
${announcements || "None"}

BUILDINGS CONSTRUCTED:
${buildList || "None"}

ELECTIONS:
${electionList || "None"}

CRISES:
${crises || "None"}

Stats: ${(messages as any[]).length} messages, ${(buildings as any[]).length} buildings, ${(elections as any[]).length} elections across ${upToTick - afterTick} ticks.

Generate 3-5 highlights as a JSON array. Each highlight:
{"tick": N, "headline": "short title (max 8 words)", "detail": "one sentence explanation", "type": "crisis|building|election|decree|milestone|drama"}

Types: crisis = bad event, building = construction, election = leadership change, decree = policy, milestone = population/economy, drama = citizen conflict.

Reply ONLY with the JSON array, no other text.`;

    try {
      const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
      const response = await mistral.chat.complete({
        model: "mistral-small-latest",
        messages: [{ role: "user", content: prompt }],
        maxTokens: 500,
        temperature: 0.5,
        responseFormat: { type: "json_object" },
      });

      const text = response?.choices?.[0]?.message?.content;
      if (!text || typeof text !== "string") throw new Error("No response");

      // Parse — handle both direct array and wrapped object
      const parsed = JSON.parse(text);
      const arr = Array.isArray(parsed) ? parsed : parsed.highlights ?? parsed.data ?? [];

      return arr.slice(0, 5).map((h: any) => ({
        tick: Number(h.tick) || afterTick,
        headline: String(h.headline ?? "").slice(0, 60),
        detail: String(h.detail ?? "").slice(0, 120),
        type: ["crisis", "building", "election", "decree", "milestone", "drama"].includes(h.type)
          ? h.type
          : "milestone",
      })) as Highlight[];
    } catch (err) {
      console.warn("[replaySummary] LLM failed, using fallback:", err);

      // Fallback: computed summary from raw data
      const highlights: Highlight[] = [];

      if ((buildings as any[]).length > 0) {
        highlights.push({
          tick: afterTick + Math.floor((upToTick - afterTick) / 2),
          headline: `${(buildings as any[]).length} new buildings constructed`,
          detail: `The city grew with ${(buildings as any[]).length} new structures during this period.`,
          type: "building",
        });
      }

      if ((elections as any[]).length > 0) {
        const e = (elections as any[])[0];
        highlights.push({
          tick: e.tickNumber,
          headline: `Election: mayor ${e.result}`,
          detail: `The citizens voted and the mayor was ${e.result}.`,
          type: "election",
        });
      }

      if ((messages as any[]).length > 0) {
        highlights.push({
          tick: afterTick,
          headline: `${(messages as any[]).length} messages exchanged`,
          detail: `Citizens were active with ${(messages as any[]).length} messages across ${upToTick - afterTick} ticks.`,
          type: "milestone",
        });
      }

      if (highlights.length === 0) {
        highlights.push({
          tick: afterTick,
          headline: "Quiet period",
          detail: `Not much happened between tick ${afterTick} and ${upToTick}.`,
          type: "milestone",
        });
      }

      return highlights;
    }
  },
});
