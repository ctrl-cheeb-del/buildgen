import {
  GRID_COLS,
  GRID_ROWS,
  PLOT_SIZE_M,
  ROAD_WIDTH_M,
} from "../grid/grid-constants";

export interface BoatState {
  x: number;
  z: number;
  heading: number; // radians, 0 = north (-Z), clockwise positive
  speed: number; // m/s
  velAngle: number; // velocity direction — diverges from heading during drift
  drifting: boolean;
}

export interface BoatKeys {
  w: boolean;
  a: boolean;
  s: boolean;
  d: boolean;
  space: boolean; // handbrake / drift trigger
}

// Grid boundaries — boat can only go OUTSIDE this area
const totalW = GRID_COLS * PLOT_SIZE_M + (GRID_COLS + 1) * ROAD_WIDTH_M;
const totalH = GRID_ROWS * PLOT_SIZE_M + (GRID_ROWS + 1) * ROAD_WIDTH_M;
const startX = -totalW / 2;
const startZ = -totalH / 2;
const endX = startX + totalW;
const endZ = startZ + totalH;

// Boat is slightly slower, more floaty than car
const MAX_SPEED = 30; // m/s
const ACCELERATION = 18; // m/s^2 — slower than car
const BRAKE_DECEL = 20; // m/s^2
const FRICTION = 6; // m/s^2 — water has less friction, coast longer
const TURN_RATE = 2.5; // rad/s — boats turn slower
const REVERSE_MAX = 8; // m/s

// Drift physics — boats drift more easily on water
const GRIP_REALIGN_RATE = 4; // slower grip recovery than car
const DRIFT_REALIGN_RATE = 0.8; // very slidey on water
const HANDBRAKE_FRICTION = 3;
const DRIFT_THRESHOLD = 0.12;
const DRIFT_SPEED_MIN = 5;

// Ocean boundary — how far the boat can go
const OCEAN_RADIUS = 3600; // ~most of the ocean plane (8km/2 = 4km, leave margin)

// Buffer zone around the city grid edge
const GRID_BUFFER = 20; // 20m buffer outside the grid

/** Check if a position is in water (outside the city grid) */
export function isInWater(x: number, z: number): boolean {
  // Must be outside the grid boundaries (with small buffer)
  const inGrid =
    x > startX - GRID_BUFFER &&
    x < endX + GRID_BUFFER &&
    z > startZ - GRID_BUFFER &&
    z < endZ + GRID_BUFFER;

  if (inGrid) return false;

  // Must be within the ocean radius
  const dist = Math.sqrt(x * x + z * z);
  return dist < OCEAN_RADIUS;
}

/** Find nearest water position — spawn point at the grid edge */
export function findNearestWaterPosition(x: number, z: number): { x: number; z: number } {
  // Spawn just outside the grid on the nearest edge
  const cx = (startX + endX) / 2;
  const cz = (startZ + endZ) / 2;

  // Direction from grid center to requested point
  const dx = x - cx;
  const dz = z - cz;
  const len = Math.sqrt(dx * dx + dz * dz);

  if (len < 0.001) {
    // Default: spawn at south edge
    return { x: cx, z: endZ + GRID_BUFFER + 30 };
  }

  const nx = dx / len;
  const nz = dz / len;

  // Find the intersection with the grid boundary + buffer
  const halfW = totalW / 2 + GRID_BUFFER + 30;
  const halfH = totalH / 2 + GRID_BUFFER + 30;

  // Scale to reach just outside the grid
  const scaleX = Math.abs(nx) > 0.001 ? halfW / Math.abs(nx) : Infinity;
  const scaleZ = Math.abs(nz) > 0.001 ? halfH / Math.abs(nz) : Infinity;
  const scale = Math.min(scaleX, scaleZ);

  return {
    x: cx + nx * scale,
    z: cz + nz * scale,
  };
}

function wrapAngle(a: number): number {
  a = a % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export interface RemoteBoatPos {
  x: number;
  z: number;
}

const BOAT_COLLISION_RADIUS = 5;
const BOAT_COLLISION_DIST = BOAT_COLLISION_RADIUS * 2;
const BOAT_COLLISION_BROAD = BOAT_COLLISION_DIST + 2;

export function updateBoat(
  state: BoatState,
  keys: BoatKeys,
  dt: number,
  remoteBoats?: RemoteBoatPos[]
): BoatState {
  let { x, z, heading, speed, velAngle, drifting } = state;

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

  speed = Math.max(-REVERSE_MAX, Math.min(MAX_SPEED, speed));

  // Turning
  if (Math.abs(speed) > 0.3) {
    const turnFactor = 0.4 + 0.6 * Math.min(Math.abs(speed) / 20, 1);
    const turnDir = speed >= 0 ? 1 : -1;
    const driftSteerBoost = drifting ? 1.4 : 1.0;
    if (keys.a) heading -= TURN_RATE * turnFactor * turnDir * driftSteerBoost * dt;
    if (keys.d) heading += TURN_RATE * turnFactor * turnDir * driftSteerBoost * dt;
  }

  // Velocity direction realignment
  const angleDiff = wrapAngle(heading - velAngle);
  const absAngleDiff = Math.abs(angleDiff);

  if (handbrake && Math.abs(speed) > DRIFT_SPEED_MIN) {
    drifting = true;
    const realign = DRIFT_REALIGN_RATE * dt;
    if (absAngleDiff > realign) {
      velAngle += Math.sign(angleDiff) * realign;
    } else {
      velAngle = heading;
    }
  } else if (drifting) {
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
    const realign = GRIP_REALIGN_RATE * dt;
    if (absAngleDiff > realign) {
      velAngle += Math.sign(angleDiff) * realign;
    } else {
      velAngle = heading;
    }
  }

  // Speed loss from drift angle
  if (absAngleDiff > DRIFT_THRESHOLD) {
    speed *= 1 - absAngleDiff * 0.2 * dt;
  }

  // Movement
  const moveAngle = speed >= 0 ? velAngle : velAngle + Math.PI;
  const absSpeed = Math.abs(speed);
  const dx = Math.sin(moveAngle) * absSpeed * dt;
  const dz = -Math.cos(moveAngle) * absSpeed * dt;
  const newX = x + dx;
  const newZ = z + dz;

  if (isInWater(newX, newZ)) {
    x = newX;
    z = newZ;
  } else {
    // Try sliding along the boundary
    const slidX = isInWater(newX, z) ? { x: newX, z } : null;
    const slidZ = isInWater(x, newZ) ? { x, z: newZ } : null;
    const slid = slidX ?? slidZ;
    if (slid) {
      x = slid.x;
      z = slid.z;
      speed *= 0.7;
    } else {
      speed *= 0.3;
    }
  }

  // Boat-to-boat collision
  if (remoteBoats) {
    for (const rb of remoteBoats) {
      const dx = x - rb.x;
      const dz = z - rb.z;
      if (Math.abs(dx) > BOAT_COLLISION_BROAD || Math.abs(dz) > BOAT_COLLISION_BROAD) continue;

      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < BOAT_COLLISION_DIST && dist > 0.001) {
        const nx = dx / dist;
        const nz = dz / dist;
        const overlap = BOAT_COLLISION_DIST - dist;
        x += nx * overlap;
        z += nz * overlap;
        speed *= 0.3;
      }
    }
  }

  return { x, z, heading, speed, velAngle, drifting };
}
