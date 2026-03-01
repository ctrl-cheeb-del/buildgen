/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as boats from "../boats.js";
import type * as buildingDesigns from "../buildingDesigns.js";
import type * as buildings from "../buildings.js";
import type * as cars from "../cars.js";
import type * as crons from "../crons.js";
import type * as fillWorld from "../fillWorld.js";
import type * as lib_normalizePrompt from "../lib/normalizePrompt.js";
import type * as multiViewPreviews from "../multiViewPreviews.js";
import type * as npcTraffic from "../npcTraffic.js";
import type * as pipeline from "../pipeline.js";
import type * as planes from "../planes.js";
import type * as plots from "../plots.js";
import type * as reseedCity from "../reseedCity.js";
import type * as reseedCityHelpers from "../reseedCityHelpers.js";
import type * as resetWorld from "../resetWorld.js";
import type * as seedBuildings from "../seedBuildings.js";
import type * as simulation__agentPrompts from "../simulation/_agentPrompts.js";
import type * as simulation__buildingHelpers from "../simulation/_buildingHelpers.js";
import type * as simulation__electionHelpers from "../simulation/_electionHelpers.js";
import type * as simulation__plotHelpers from "../simulation/_plotHelpers.js";
import type * as simulation__simBuildHelpers from "../simulation/_simBuildHelpers.js";
import type * as simulation__tickLogHelpers from "../simulation/_tickLogHelpers.js";
import type * as simulation_agentBuild from "../simulation/agentBuild.js";
import type * as simulation_agentMessages from "../simulation/agentMessages.js";
import type * as simulation_agentTick from "../simulation/agentTick.js";
import type * as simulation_agents from "../simulation/agents.js";
import type * as simulation_cityState from "../simulation/cityState.js";
import type * as simulation_control from "../simulation/control.js";
import type * as simulation_ensureRunning from "../simulation/ensureRunning.js";
import type * as simulation_expandAgents from "../simulation/expandAgents.js";
import type * as simulation_initialize from "../simulation/initialize.js";
import type * as simulation_mistral_retry from "../simulation/mistral_retry.js";
import type * as simulation_replay from "../simulation/replay.js";
import type * as simulation_replaySummary from "../simulation/replaySummary.js";
import type * as simulation_start from "../simulation/start.js";
import type * as simulation_tick from "../simulation/tick.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  boats: typeof boats;
  buildingDesigns: typeof buildingDesigns;
  buildings: typeof buildings;
  cars: typeof cars;
  crons: typeof crons;
  fillWorld: typeof fillWorld;
  "lib/normalizePrompt": typeof lib_normalizePrompt;
  multiViewPreviews: typeof multiViewPreviews;
  npcTraffic: typeof npcTraffic;
  pipeline: typeof pipeline;
  planes: typeof planes;
  plots: typeof plots;
  reseedCity: typeof reseedCity;
  reseedCityHelpers: typeof reseedCityHelpers;
  resetWorld: typeof resetWorld;
  seedBuildings: typeof seedBuildings;
  "simulation/_agentPrompts": typeof simulation__agentPrompts;
  "simulation/_buildingHelpers": typeof simulation__buildingHelpers;
  "simulation/_electionHelpers": typeof simulation__electionHelpers;
  "simulation/_plotHelpers": typeof simulation__plotHelpers;
  "simulation/_simBuildHelpers": typeof simulation__simBuildHelpers;
  "simulation/_tickLogHelpers": typeof simulation__tickLogHelpers;
  "simulation/agentBuild": typeof simulation_agentBuild;
  "simulation/agentMessages": typeof simulation_agentMessages;
  "simulation/agentTick": typeof simulation_agentTick;
  "simulation/agents": typeof simulation_agents;
  "simulation/cityState": typeof simulation_cityState;
  "simulation/control": typeof simulation_control;
  "simulation/ensureRunning": typeof simulation_ensureRunning;
  "simulation/expandAgents": typeof simulation_expandAgents;
  "simulation/initialize": typeof simulation_initialize;
  "simulation/mistral_retry": typeof simulation_mistral_retry;
  "simulation/replay": typeof simulation_replay;
  "simulation/replaySummary": typeof simulation_replaySummary;
  "simulation/start": typeof simulation_start;
  "simulation/tick": typeof simulation_tick;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
