import {
  GRID_COLS,
  GRID_ROWS,
  PLOT_SIZE_M,
  ROAD_WIDTH_M,
  GRID_STEP_M,
  PAVEMENT_WIDTH_M,
} from "../grid/grid-constants";
import { plotCenterMeters } from "../grid/grid-geometry";
import type { Waypoint } from "./npc-types";

/**
 * Road intersection grid:
 * Roads sit between plots. Intersections are at the corners of each plot.
 * Grid has (GRID_COLS + 1) × (GRID_ROWS + 1) = 9 × 11 = 99 intersections.
 */
const INTERSECTION_COLS = GRID_COLS + 1; // 9

function gridOffsets() {
  const totalW = GRID_COLS * PLOT_SIZE_M + (GRID_COLS + 1) * ROAD_WIDTH_M;
  const totalH = GRID_ROWS * PLOT_SIZE_M + (GRID_ROWS + 1) * ROAD_WIDTH_M;
  return { startX: -totalW / 2, startZ: -totalH / 2 };
}

/** Get road intersection position at grid node (ix, iz) */
function intersectionPos(ix: number, iz: number): Waypoint {
  const { startX, startZ } = gridOffsets();
  const x = startX + ix * GRID_STEP_M + ROAD_WIDTH_M / 2;
  const z = startZ + iz * GRID_STEP_M + ROAD_WIDTH_M / 2;
  return { x, z };
}

/** Convert intersection grid coords to a flat intersection ID */
export function intersectionId(ix: number, iz: number): number {
  return iz * INTERSECTION_COLS + ix;
}

/** Lane offset: perpendicular-right of travel direction */
function laneOffset(
  from: Waypoint,
  to: Waypoint,
  offsetDist: number
): { dx: number; dz: number } {
  const dirX = to.x - from.x;
  const dirZ = to.z - from.z;
  const len = Math.sqrt(dirX * dirX + dirZ * dirZ);
  if (len < 0.01) return { dx: 0, dz: 0 };
  // Perpendicular right = (dz, -dx) normalized
  return {
    dx: (dirZ / len) * offsetDist,
    dz: (-dirX / len) * offsetDist,
  };
}

/** Determine if a segment is primarily horizontal or vertical */
function segmentDirection(
  from: Waypoint,
  to: Waypoint
): "horizontal" | "vertical" {
  const dx = Math.abs(to.x - from.x);
  const dz = Math.abs(to.z - from.z);
  return dx >= dz ? "horizontal" : "vertical";
}

const LANE_OFFSET = 4; // 4m right of center line (visible separation on 16m roads)
const CORNER_RADIUS = 6; // meters for corner rounding

/**
 * Apply lane offset with corner rounding to a raw intersection route.
 * At each turn, inserts 2 intermediate waypoints to smooth the offset jump.
 */
function applyLaneOffsetWithCorners(
  rawRoute: Array<Waypoint & { _ix?: number; _iz?: number }>,
  isLoop: boolean
): Waypoint[] {
  if (rawRoute.length < 2) return rawRoute;

  const result: Waypoint[] = [];

  for (let i = 0; i < rawRoute.length; i++) {
    const prev = rawRoute[(i - 1 + rawRoute.length) % rawRoute.length];
    const curr = rawRoute[i];
    const next = rawRoute[(i + 1) % rawRoute.length];

    // For first/last waypoints on non-loops, just offset normally
    if (!isLoop && (i === 0 || i === rawRoute.length - 1)) {
      const neighbor = i === 0 ? next : prev;
      const lo = laneOffset(curr, neighbor, i === 0 ? LANE_OFFSET : -LANE_OFFSET);
      const dir = segmentDirection(curr, neighbor);
      const iid = curr._ix !== undefined && curr._iz !== undefined
        ? intersectionId(curr._ix, curr._iz)
        : -1;
      result.push({
        x: curr.x + lo.dx,
        z: curr.z + lo.dz,
        intersectionId: iid,
        travelDirection: dir,
      });
      continue;
    }

    // Check if there's a turn at this waypoint
    const inDir = { x: curr.x - prev.x, z: curr.z - prev.z };
    const outDir = { x: next.x - curr.x, z: next.z - curr.z };
    const inLen = Math.sqrt(inDir.x * inDir.x + inDir.z * inDir.z);
    const outLen = Math.sqrt(outDir.x * outDir.x + outDir.z * outDir.z);

    if (inLen < 0.01 || outLen < 0.01) {
      const lo = laneOffset(curr, next, LANE_OFFSET);
      result.push({ x: curr.x + lo.dx, z: curr.z + lo.dz });
      continue;
    }

    // Normalize directions
    const inNorm = { x: inDir.x / inLen, z: inDir.z / inLen };
    const outNorm = { x: outDir.x / outLen, z: outDir.z / outLen };

    // Dot product to detect turn
    const dot = inNorm.x * outNorm.x + inNorm.z * outNorm.z;

    if (dot > 0.9) {
      // Straight segment — just offset
      const lo = laneOffset(curr, next, LANE_OFFSET);
      const dir = segmentDirection(curr, next);
      const iid = curr._ix !== undefined && curr._iz !== undefined
        ? intersectionId(curr._ix, curr._iz)
        : -1;
      result.push({
        x: curr.x + lo.dx,
        z: curr.z + lo.dz,
        intersectionId: iid,
        travelDirection: dir,
      });
    } else {
      // Turn — insert pre-corner and post-corner waypoints
      const inLane = laneOffset(prev, curr, LANE_OFFSET);
      const outLane = laneOffset(curr, next, LANE_OFFSET);

      const r = Math.min(CORNER_RADIUS, inLen * 0.4, outLen * 0.4);

      const inTravelDir = segmentDirection(prev, curr);
      const iid = curr._ix !== undefined && curr._iz !== undefined
        ? intersectionId(curr._ix, curr._iz)
        : -1;

      // Pre-corner: on incoming lane, r meters before intersection — check traffic light here
      result.push({
        x: curr.x + inLane.dx - inNorm.x * r,
        z: curr.z + inLane.dz - inNorm.z * r,
        intersectionId: iid,
        travelDirection: inTravelDir,
      });

      // Post-corner: on outgoing lane, r meters after intersection
      // No intersectionId — car already committed to the turn, don't re-check traffic light
      result.push({
        x: curr.x + outLane.dx + outNorm.x * r,
        z: curr.z + outLane.dz + outNorm.z * r,
      });
    }
  }

  return result;
}

/**
 * Build a clockwise rectangular circuit for a car between two plots.
 * All circuits rotate the same direction, so shared road segments always
 * have unidirectional traffic — no head-on collisions possible.
 * Includes intermediate intersection waypoints for proper traffic light checks.
 */
export function buildCarRoute(
  homeCol: number,
  homeRow: number,
  workCol: number,
  workRow: number
): Waypoint[] {
  // Pick intersection nodes between home and work plots
  const ix1 = homeCol + (workCol >= homeCol ? 1 : 0);
  const iz1 = homeRow + (workRow >= homeRow ? 1 : 0);
  const ix2 = workCol + (workCol >= homeCol ? 0 : 1);
  const iz2 = workRow + (workRow >= homeRow ? 0 : 1);

  let minIX = Math.min(ix1, ix2);
  let maxIX = Math.max(ix1, ix2);
  let minIZ = Math.min(iz1, iz2);
  let maxIZ = Math.max(iz1, iz2);

  // Ensure rectangle (not a line) by jogging 1 intersection
  if (minIX === maxIX) {
    if (maxIX < GRID_COLS) maxIX += 1;
    else minIX -= 1;
  }
  if (minIZ === maxIZ) {
    if (maxIZ < GRID_ROWS) maxIZ += 1;
    else minIZ -= 1;
  }

  type RawWP = Waypoint & { _ix: number; _iz: number };
  const mkWP = (ix: number, iz: number): RawWP => ({
    ...intersectionPos(ix, iz),
    _ix: ix,
    _iz: iz,
  });

  // Build clockwise circuit with intermediate intersections at every grid node
  // Top edge: left → right
  const rawRoute: RawWP[] = [];
  for (let ix = minIX; ix < maxIX; ix++) rawRoute.push(mkWP(ix, minIZ));
  // Right edge: top → bottom
  for (let iz = minIZ; iz < maxIZ; iz++) rawRoute.push(mkWP(maxIX, iz));
  // Bottom edge: right → left
  for (let ix = maxIX; ix > minIX; ix--) rawRoute.push(mkWP(ix, maxIZ));
  // Left edge: bottom → top
  for (let iz = maxIZ; iz > minIZ; iz--) rawRoute.push(mkWP(minIX, iz));

  return applyLaneOffsetWithCorners(rawRoute, true);
}

/**
 * Build a pedestrian route — walk the pavement perimeter of their home plot.
 * 4-corner rectangle at (PLOT_SIZE_M/2 - PAVEMENT_WIDTH_M/2) from plot center.
 */
export function buildPedestrianRoute(col: number, row: number): Waypoint[] {
  const [cx, cz] = plotCenterMeters(col, row);
  const half = PLOT_SIZE_M / 2 - PAVEMENT_WIDTH_M / 2;

  const corners: Waypoint[] = [
    { x: cx - half, z: cz - half },
    { x: cx + half, z: cz - half },
    { x: cx + half, z: cz + half },
    { x: cx - half, z: cz + half },
  ];

  // Random start corner
  const start = Math.floor(Math.random() * 4);
  const route: Waypoint[] = [];
  for (let i = 0; i < 4; i++) {
    route.push(corners[(start + i) % 4]);
  }

  return route;
}

/**
 * Build a cross-plot pedestrian route on pavements.
 *
 * Layout from plot center outward:
 *   0–54m  grass (GRASS_HALF_M)
 *   54–60m pavement (PAVEMENT_WIDTH_M = 6m)
 *   60–76m road (ROAD_WIDTH_M = 16m)
 *   76–82m pavement (next plot)
 *
 * Pavement center = PLOT_SIZE_M/2 - PAVEMENT_WIDTH_M/2 = 57m from plot center.
 * Pedestrians walk at the pavement center line, which is safely outside the road.
 *
 * Returns a round-trip: home → destination → home.
 */
export function buildPedestrianCrossRoute(
  homeCol: number,
  homeRow: number,
  destCol: number,
  destRow: number
): Waypoint[] {
  // Pavement center is at 57m from plot center (on the plot side, NOT on the road)
  const pavCenter = PLOT_SIZE_M / 2 - PAVEMENT_WIDTH_M / 2; // 57m

  const [homeCX, homeCZ] = plotCenterMeters(homeCol, homeRow);
  const [destCX, destCZ] = plotCenterMeters(destCol, destRow);

  // Start: pavement edge of home plot facing the direction of travel
  const goingRight = destCol >= homeCol;
  const goingDown = destRow >= homeRow;

  const startX = homeCX + (goingRight ? pavCenter : -pavCenter);
  const startZ = homeCZ + (goingDown ? pavCenter : -pavCenter);

  const endX = destCX + (goingRight ? -pavCenter : pavCenter);
  const endZ = destCZ + (goingDown ? -pavCenter : pavCenter);

  // When crossing roads, walk on the pavement on our side of the road.
  // Road center between plot (col) and plot (col+1) is at:
  //   plotCenter(col) + PLOT_SIZE_M/2 + ROAD_WIDTH_M/2  (= 68m from plot center)
  // Pavement on home side of that road is at:
  //   plotCenter(col) + pavCenter  (= 57m from plot center)
  // That's 11m before road center, safely on the pavement.

  const horizontalFirst = Math.random() < 0.5;
  const outbound: Waypoint[] = [{ x: startX, z: startZ }];

  if (horizontalFirst) {
    // Walk horizontally along pavement, then vertically
    if (Math.abs(destCol - homeCol) > 0) {
      // Walk Z on home plot's pavement: use the side facing the travel direction
      const walkZ = goingDown
        ? homeCZ + pavCenter  // pavement on +Z side of home plot
        : homeCZ - pavCenter; // pavement on -Z side of home plot

      // Walk from start to end X along this pavement line
      outbound.push({ x: startX, z: walkZ });
      outbound.push({ x: endX, z: walkZ });
    }
    if (Math.abs(destRow - homeRow) > 0 || Math.abs(destCol - homeCol) === 0) {
      outbound.push({ x: endX, z: endZ });
    } else {
      // Same row, just need to arrive
      outbound.push({ x: endX, z: endZ });
    }
  } else {
    // Walk vertically along pavement, then horizontally
    if (Math.abs(destRow - homeRow) > 0) {
      const walkX = goingRight
        ? homeCX + pavCenter
        : homeCX - pavCenter;

      outbound.push({ x: walkX, z: startZ });
      outbound.push({ x: walkX, z: endZ });
    }
    outbound.push({ x: endX, z: endZ });
  }

  // Deduplicate consecutive identical waypoints
  const deduped: Waypoint[] = [outbound[0]];
  for (let i = 1; i < outbound.length; i++) {
    const prev = deduped[deduped.length - 1];
    if (Math.abs(outbound[i].x - prev.x) > 0.5 || Math.abs(outbound[i].z - prev.z) > 0.5) {
      deduped.push(outbound[i]);
    }
  }

  if (deduped.length < 2) return buildPedestrianRoute(homeCol, homeRow);

  // Return trip
  const inbound = [...deduped].reverse();
  return [...deduped, ...inbound.slice(1)];
}
