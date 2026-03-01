import {
  GRID_COLS,
  GRID_ROWS,
  PLOT_SIZE_M,
  ROAD_WIDTH_M,
  GRID_STEP_M,
} from "../grid/grid-constants";

export interface CarState {
  x: number;
  z: number;
  heading: number; // radians, 0 = north (-Z in scene), clockwise positive
  speed: number; // m/s
  velAngle: number; // velocity direction (radians), diverges from heading during drift
  drifting: boolean; // true when actively drifting
}

export interface CarKeys {
  w: boolean;
  a: boolean;
  s: boolean;
  d: boolean;
  space: boolean; // handbrake — triggers drift
}

const totalW = GRID_COLS * PLOT_SIZE_M + (GRID_COLS + 1) * ROAD_WIDTH_M;
const totalH = GRID_ROWS * PLOT_SIZE_M + (GRID_ROWS + 1) * ROAD_WIDTH_M;
const startX = -totalW / 2;
const startZ = -totalH / 2;

const MAX_SPEED = 40; // m/s (~90mph)
const ACCELERATION = 28; // m/s^2 — snappy acceleration
const BRAKE_DECEL = 40; // m/s^2 — firm brakes
const FRICTION = 12; // m/s^2 passive deceleration
const TURN_RATE = 3.5; // rad/s — sharp turns
const REVERSE_MAX = 12; // m/s max reverse speed

// Drift physics
const GRIP_REALIGN_RATE = 8; // how fast velocity aligns to heading (rad/s) — normal grip
const DRIFT_REALIGN_RATE = 1.5; // much slower realignment while drifting
const HANDBRAKE_FRICTION = 6; // lighter friction during handbrake (lets you slide)
const DRIFT_THRESHOLD = 0.15; // min angle (rad) between heading & velocity to count as drifting
const DRIFT_SPEED_MIN = 8; // minimum speed to initiate drift

export interface BuildingAABB {
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
}

/** Check whether a position is within the driveable grid area (roads + plots) */
export function isInGrid(x: number, z: number): boolean {
  const relX = x - startX;
  const relZ = z - startZ;
  return relX >= 0 && relX <= totalW && relZ >= 0 && relZ <= totalH;
}

export function findNearestRoadPosition(x: number, z: number): { x: number; z: number } {
  // Snap to nearest road intersection center
  const relX = x - startX;
  const relZ = z - startZ;
  const nearestColRoad = Math.round(relX / GRID_STEP_M) * GRID_STEP_M + ROAD_WIDTH_M / 2;
  const nearestRowRoad = Math.round(relZ / GRID_STEP_M) * GRID_STEP_M + ROAD_WIDTH_M / 2;
  return {
    x: startX + nearestColRoad,
    z: startZ + nearestRowRoad,
  };
}

/** Normalize angle to [-PI, PI] */
function wrapAngle(a: number): number {
  a = a % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export interface RemoteCarPos {
  x: number;
  z: number;
}

const CAR_COLLISION_RADIUS = 4; // ~4m per car
const CAR_COLLISION_DIST = CAR_COLLISION_RADIUS * 2; // sum of two radii
const CAR_COLLISION_BROAD = CAR_COLLISION_DIST + 2; // broad-phase threshold (cheap axis check)

const CAR_COLLISION_SPHERE = 4; // car's collision radius for building checks
const BUILDING_CHECK_RADIUS = 60; // broad-phase skip distance

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function updateCar(state: CarState, keys: CarKeys, dt: number, remoteCars?: RemoteCarPos[], buildings?: BuildingAABB[]): CarState {
  let { x, z, heading, speed, velAngle, drifting } = state;

  // Clamp dt to avoid physics explosions on tab-away
  dt = Math.min(dt, 0.1);

  const handbrake = keys.space;

  // Acceleration / braking
  if (keys.w) {
    speed += ACCELERATION * dt;
  } else if (keys.s) {
    if (speed > 0.5) {
      speed -= BRAKE_DECEL * dt;
    } else {
      speed -= ACCELERATION * 0.5 * dt;
    }
  } else {
    const fric = handbrake ? HANDBRAKE_FRICTION : FRICTION;
    if (Math.abs(speed) < fric * dt) {
      speed = 0;
    } else {
      speed -= Math.sign(speed) * fric * dt;
    }
  }

  // Clamp speed
  speed = Math.max(-REVERSE_MAX, Math.min(MAX_SPEED, speed));

  // Turning — heading changes (where the car POINTS)
  if (Math.abs(speed) > 0.3) {
    const turnFactor = 0.4 + 0.6 * Math.min(Math.abs(speed) / 20, 1);
    const turnDir = speed >= 0 ? 1 : -1;
    // Slightly faster steering during drift for dramatic slides
    const driftSteerBoost = drifting ? 1.3 : 1.0;
    if (keys.a) heading -= TURN_RATE * turnFactor * turnDir * driftSteerBoost * dt;
    if (keys.d) heading += TURN_RATE * turnFactor * turnDir * driftSteerBoost * dt;
  }

  // Velocity direction realignment toward heading
  // With grip: velocity quickly snaps to heading (normal driving)
  // With handbrake or drifting: velocity slowly follows heading (slide/drift)
  const angleDiff = wrapAngle(heading - velAngle);
  const absAngleDiff = Math.abs(angleDiff);

  if (handbrake && Math.abs(speed) > DRIFT_SPEED_MIN) {
    // Handbrake: enter/maintain drift — slow realignment
    drifting = true;
    const realign = DRIFT_REALIGN_RATE * dt;
    if (absAngleDiff > realign) {
      velAngle += Math.sign(angleDiff) * realign;
    } else {
      velAngle = heading;
    }
  } else if (drifting) {
    // Released handbrake but still drifting — gradually regain grip
    const realign = (DRIFT_REALIGN_RATE + (GRIP_REALIGN_RATE - DRIFT_REALIGN_RATE) * 0.5) * dt;
    if (absAngleDiff > realign) {
      velAngle += Math.sign(angleDiff) * realign;
    } else {
      velAngle = heading;
      drifting = false;
    }
    if (absAngleDiff < DRIFT_THRESHOLD) {
      drifting = false;
    }
  } else {
    // Normal driving — velocity snaps to heading quickly
    const realign = GRIP_REALIGN_RATE * dt;
    if (absAngleDiff > realign) {
      velAngle += Math.sign(angleDiff) * realign;
    } else {
      velAngle = heading;
    }
  }

  // Lose some speed proportional to drift angle (tire scrub)
  if (absAngleDiff > DRIFT_THRESHOLD) {
    speed *= 1 - absAngleDiff * 0.3 * dt;
  }

  // Compute new position — move along VELOCITY angle, not heading
  const moveAngle = speed >= 0 ? velAngle : velAngle + Math.PI;
  const absSpeed = Math.abs(speed);
  const dx = Math.sin(moveAngle) * absSpeed * dt;
  const dz = -Math.cos(moveAngle) * absSpeed * dt;
  const newX = x + dx;
  const newZ = z + dz;

  if (isInGrid(newX, newZ)) {
    x = newX;
    z = newZ;
  } else {
    // Slide along grid boundary
    const slid =
      isInGrid(newX, z) ? { x: newX, z } :
      isInGrid(x, newZ) ? { x, z: newZ } :
      null;
    if (slid) {
      x = slid.x;
      z = slid.z;
      speed *= 0.7;
    } else {
      speed *= 0.3;
    }
  }

  // ── Building collision (AABB) ──
  if (buildings) {
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      // Broad-phase: skip far buildings
      const bcx = (b.minX + b.maxX) * 0.5;
      const bcz = (b.minZ + b.maxZ) * 0.5;
      const bDx = x - bcx;
      const bDz = z - bcz;
      if (bDx * bDx + bDz * bDz > BUILDING_CHECK_RADIUS * BUILDING_CHECK_RADIUS) continue;

      // Closest point on AABB to car (Y fixed at ground level)
      const cx = clamp(x, b.minX, b.maxX);
      const cz = clamp(z, b.minZ, b.maxZ);

      const ddx = x - cx;
      const ddz = z - cz;
      const dist2 = ddx * ddx + ddz * ddz;

      if (dist2 < CAR_COLLISION_SPHERE * CAR_COLLISION_SPHERE) {
        const dist = Math.sqrt(dist2);
        if (dist > 0.001) {
          const pen = CAR_COLLISION_SPHERE - dist;
          x += (ddx / dist) * pen;
          z += (ddz / dist) * pen;
        } else {
          // Car center inside AABB — push out on shallowest axis
          const penX = Math.min(x - b.minX, b.maxX - x);
          const penZ = Math.min(z - b.minZ, b.maxZ - z);
          if (penX <= penZ) {
            x += x - bcx > 0 ? penX + CAR_COLLISION_SPHERE : -(penX + CAR_COLLISION_SPHERE);
          } else {
            z += z - bcz > 0 ? penZ + CAR_COLLISION_SPHERE : -(penZ + CAR_COLLISION_SPHERE);
          }
        }
        speed *= 0.15;
      }
    }
  }

  // Car-to-car collision
  if (remoteCars) {
    for (const rc of remoteCars) {
      // Broad-phase: cheap per-axis check to skip distant cars
      const dx = x - rc.x;
      const dz = z - rc.z;
      if (Math.abs(dx) > CAR_COLLISION_BROAD || Math.abs(dz) > CAR_COLLISION_BROAD) continue;

      // Narrow-phase: actual distance
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < CAR_COLLISION_DIST && dist > 0.001) {
        // Push local car out along collision normal
        const nx = dx / dist;
        const nz = dz / dist;
        const overlap = CAR_COLLISION_DIST - dist;
        x += nx * overlap;
        z += nz * overlap;
        speed *= 0.3;
      }
    }
  }

  return { x, z, heading, speed, velAngle, drifting };
}
