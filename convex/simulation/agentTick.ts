"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { Mistral } from "@mistralai/mistralai";
import { withRetry, resetQuotaFlag } from "./mistral_retry";
import {
  AgentDoc,
  CityStateDoc,
  callCitizenAgent,
  actionToMessageType,
} from "./_agentPrompts";

const MAX_PER_TICK = 12;
const INTER_AGENT_DELAY_MS = 250;
const NEXT_TICK_MS = 8000;

function getMistral(): Mistral {
  return new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
}

export const run = internalAction({
  args: {},
  handler: async (ctx) => {
    // 1. Check isRunning
    const city: CityStateDoc | null = await ctx.runQuery(
      internal.simulation.cityState.getInternal,
    );
    if (!city || !city.isRunning) {
      console.log("[agentTick] Simulation not running, stopping");
      return;
    }

    const tickNumber = city.totalTicks;
    const now = Date.now();
    const isLive = city.simMode === "live";

    // 2. Load all agents
    const agents: AgentDoc[] = await ctx.runQuery(
      internal.simulation.agents.getAllInternal,
    );

    // 3. Filter agents due to act
    const dueAgents = agents
      .filter(
        (a) =>
          a.role === "citizen" &&
          a.isActive &&
          (a.nextActionAt == null || a.nextActionAt <= now),
      )
      .sort((a, b) => (a.nextActionAt ?? 0) - (b.nextActionAt ?? 0))
      .slice(0, MAX_PER_TICK);

    if (dueAgents.length === 0) {
      // No agents due — schedule next tick and bail
      const nextAgentTickId = await ctx.scheduler.runAfter(
        NEXT_TICK_MS,
        internal.simulation.agentTick.run,
        {},
      );
      await ctx.runMutation(internal.simulation.cityState.update, {
        patch: { nextAgentTickId },
      });
      return;
    }

    console.log(
      `[agentTick] Processing ${dueAgents.length} due agents (tick ${tickNumber})`,
    );

    const mistral = getMistral();
    resetQuotaFlag();

    // Build a map of building count per plot
    const allBuildings: Array<{
      _id: string;
      plotIndex: number;
      category?: string;
      ownerId: string;
    }> = await ctx.runQuery(
      internal.simulation._buildingHelpers.getAllWithCategory as any,
    );
    const plotBuildingCounts: Record<number, number> = {};
    for (const b of allBuildings) {
      plotBuildingCounts[b.plotIndex] =
        (plotBuildingCounts[b.plotIndex] ?? 0) + 1;
    }

    let processed = 0;

    // 6. Process each agent sequentially
    for (const agent of dueAgents) {
      // a. Sleep 250ms between agents (skip for first)
      if (processed > 0) {
        await new Promise((r) => setTimeout(r, INTER_AGENT_DELAY_MS));
      }

      try {
        // b. Reset quota flag
        resetQuotaFlag();

        // c. Build nearby actions string
        const nearby = agents
          .filter(
            (c) =>
              c.role === "citizen" &&
              Math.abs(c.plotIndex - agent.plotIndex) <= 8 &&
              c._id !== agent._id,
          )
          .slice(0, 3)
          .map((c) =>
            c.lastAction
              ? `${c.name}: ${c.lastAction}`
              : `${c.name} is quiet`,
          )
          .join("; ");

        // d. Call Mistral
        const action = await withRetry(
          () =>
            callCitizenAgent(
              mistral,
              agent,
              city,
              nearby || "All quiet",
              plotBuildingCounts[agent.plotIndex] ?? 0,
            ),
          `citizen:${agent.name}`,
        );

        // e. Store message
        if (action.action !== "IDLE" || action.message) {
          await ctx.runMutation(internal.simulation.agentMessages.create, {
            senderPlotIndex: agent.plotIndex,
            senderName: agent.name,
            content: action.message.slice(0, 80) || `[${action.action}]`,
            messageType: actionToMessageType(action.action),
            tickNumber,
          });
        }

        // Handle REQUEST_BUILD
        let effectiveAction = action.action;
        const plotCount = plotBuildingCounts[agent.plotIndex] ?? 0;
        if (action.action === "REQUEST_BUILD") {
          if (plotCount >= 8) {
            // Plot full — convert to CHAT
            effectiveAction = "CHAT";
          } else if (action.build_description) {
            // Set pending build for city tick to pick up
            await ctx.runMutation(internal.simulation.agents.update, {
              agentId: agent._id as any,
              patch: {
                pendingBuildDescription: action.build_description,
              },
            });
          }
        }

        // f. Compute next action interval
        const minDelay = isLive ? 20000 : 60000;
        const maxDelay = isLive ? 90000 : 180000;
        const nextActionAt =
          now + minDelay + Math.random() * (maxDelay - minDelay);

        // Update agent state
        await ctx.runMutation(internal.simulation.agents.update, {
          agentId: agent._id as any,
          patch: {
            lastAction: action.message || effectiveAction,
            lastActionTick: tickNumber,
            memoryBuffer: [
              ...agent.memoryBuffer,
              ...(action.message
                ? [`Tick ${tickNumber}: I said "${action.message}"`]
                : []),
            ].slice(-5),
            nextActionAt,
          },
        });

        processed++;
      } catch (e) {
        console.error(
          `[agentTick] Agent ${agent.name} failed:`,
          e,
        );
        // Still update nextActionAt so we don't retry immediately
        const fallbackDelay = isLive ? 45000 : 120000;
        await ctx.runMutation(internal.simulation.agents.update, {
          agentId: agent._id as any,
          patch: { nextActionAt: now + fallbackDelay },
        });
        processed++;
      }
    }

    console.log(
      `[agentTick] Processed ${processed} agents`,
    );

    // 7. Schedule next agent tick
    const nextAgentTickId = await ctx.scheduler.runAfter(
      NEXT_TICK_MS,
      internal.simulation.agentTick.run,
      {},
    );
    await ctx.runMutation(internal.simulation.cityState.update, {
      patch: { nextAgentTickId },
    });
  },
});
