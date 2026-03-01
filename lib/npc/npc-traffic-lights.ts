import {
  GRID_COLS,
  GRID_ROWS,
  GRID_STEP_M,
  ROAD_WIDTH_M,
} from "../grid/grid-constants";

/**
 * Traffic light system for the intersection grid.
 * 99 intersections (9 × 11), each with a 2-phase signal:
 *   Phase 0: horizontal roads green, vertical roads red
 *   Phase 1: vertical roads green, horizontal roads red
 */

const INTERSECTION_COLS = GRID_COLS + 1; // 9
const INTERSECTION_ROWS = GRID_ROWS + 1; // 11
export const TOTAL_INTERSECTIONS = INTERSECTION_COLS * INTERSECTION_ROWS; // 99

/** Cycle time per phase in seconds */
const PHASE_DURATION = 9;
const FULL_CYCLE = PHASE_DURATION * 2; // 18s total cycle

/** Stagger offset per row to break green waves */
const ROW_STAGGER = 3; // seconds offset per row

export interface TrafficLight {
  /** Intersection index (0-98) */
  id: number;
  /** Grid column (0-8) */
  ix: number;
  /** Grid row (0-10) */
  iz: number;
  /** World X position */
  x: number;
  /** World Z position */
  z: number;
  /** Time offset for staggering (seconds) */
  phaseOffset: number;
}

let lights: TrafficLight[] | null = null;

function gridOffsets() {
  const totalW = GRID_COLS * (120) + (GRID_COLS + 1) * ROAD_WIDTH_M;
  const totalH = GRID_ROWS * (120) + (GRID_ROWS + 1) * ROAD_WIDTH_M;
  return { startX: -totalW / 2, startZ: -totalH / 2 };
}

/** Initialize the traffic light array (call once). */
export function initTrafficLights(): TrafficLight[] {
  if (lights) return lights;

  const { startX, startZ } = gridOffsets();
  lights = [];

  for (let iz = 0; iz < INTERSECTION_ROWS; iz++) {
    for (let ix = 0; ix < INTERSECTION_COLS; ix++) {
      const id = iz * INTERSECTION_COLS + ix;
      const x = startX + ix * GRID_STEP_M + ROAD_WIDTH_M / 2;
      const z = startZ + iz * GRID_STEP_M + ROAD_WIDTH_M / 2;

      // Stagger by row + checkerboard to avoid green waves
      const phaseOffset = (iz * ROW_STAGGER + ix * 1.5) % FULL_CYCLE;

      lights.push({ id, ix, iz, x, z, phaseOffset });
    }
  }

  return lights;
}

/** Get all traffic lights. */
export function getTrafficLights(): TrafficLight[] {
  return lights ?? initTrafficLights();
}

/**
 * Check if a given intersection is green for the specified travel direction.
 * O(1) — just a modular time check.
 */
export function isGreen(
  lightId: number,
  direction: "horizontal" | "vertical",
  worldTime: number
): boolean {
  const allLights = getTrafficLights();
  const light = allLights[lightId];
  if (!light) return true; // fallback to green

  const cycleTime = (worldTime + light.phaseOffset) % FULL_CYCLE;
  const isPhase0 = cycleTime < PHASE_DURATION;

  // Phase 0 = horizontal green, Phase 1 = vertical green
  if (direction === "horizontal") return isPhase0;
  return !isPhase0;
}

/**
 * Get the current phase for a light (0 = horizontal green, 1 = vertical green).
 * Used by the mesh renderer to set signal colors.
 */
export function getLightPhase(
  lightId: number,
  worldTime: number
): 0 | 1 {
  const allLights = getTrafficLights();
  const light = allLights[lightId];
  if (!light) return 0;

  const cycleTime = (worldTime + light.phaseOffset) % FULL_CYCLE;
  return cycleTime < PHASE_DURATION ? 0 : 1;
}
