import {
  GRID_COLS,
  GRID_ROWS,
  PLOT_SIZE_M,
  ROAD_WIDTH_M,
  GRID_STEP_M,
  PAVEMENT_WIDTH_M,
} from "../grid/grid-constants";

export interface PlaneState {
  x: number;
  y: number; // altitude — 0 = ground level
  z: number;
  heading: number; // yaw — radians, 0 = north (-Z), clockwise
  pitch: number; // nose angle — positive = nose up, negative = nose down
  roll: number; // bank angle — positive = right wing down
  speed: number; // m/s forward along heading+pitch
  grounded: boolean; // true when on the ground
}

export interface PlaneKeys {
  w: boolean; // throttle up
  s: boolean; // brake / throttle down
  a: boolean; // roll left
  d: boolean; // roll right
  space: boolean; // pitch up (pull back)
  shift: boolean; // pitch down (push forward)
}

// ── Grid boundaries for ground collision ──
const totalW = GRID_COLS * PLOT_SIZE_M + (GRID_COLS + 1) * ROAD_WIDTH_M;
const totalH = GRID_ROWS * PLOT_SIZE_M + (GRID_ROWS + 1) * ROAD_WIDTH_M;
const startX = -totalW / 2;
const startZ = -totalH / 2;

// ── Flight parameters ──
const MAX_SPEED = 80; // m/s (~180mph)
const MIN_FLIGHT_SPEED = 15; // m/s — stall below this in air
const TAKEOFF_SPEED = 22; // m/s — need this speed + pitch to lift off
const ACCELERATION = 20; // m/s^2 — jet-like thrust
const BRAKE_DECEL = 25; // m/s^2
const AIR_FRICTION = 3; // m/s^2 — low drag in air
const GROUND_FRICTION = 10; // m/s^2 — higher on ground
const REVERSE_MAX = 5; // m/s — taxiing backward

// ── Rotation rates ──
const ROLL_RATE = 2.5; // rad/s — how fast A/D rolls the plane
const PITCH_RATE = 1.5; // rad/s — how fast space/shift pitches
const YAW_FROM_ROLL = 1.2; // rad/s per radian of roll — banking turns
const ROLL_RETURN_RATE = 1.5; // rad/s — roll returns to level when no A/D
const PITCH_RETURN_RATE = 0.5; // rad/s — gentle pitch return to 0
const GROUND_TURN_RATE = 2.0; // rad/s — turning while taxiing

// ── Physics ──
const GRAVITY = 20; // m/s^2 — how fast you fall
const LIFT_FACTOR = 2.5; // lift per m/s of speed (when pitched correctly)
const MAX_ALTITUDE = 800; // m — ceiling
const GROUND_LEVEL = 0.5; // m — wheels clearance when grounded

// ── Building collision (simplified bounding boxes) ──
const BUILDING_CHECK_RADIUS = 60; // m — only check buildings within this radius

/** Simple ground height — 0 everywhere (flat city) */
function getGroundHeight(_x: number, _z: number): number {
  return 0;
}

/** Check if position is on a road/pavement (for taxiing) */
function isOnSurface(x: number, z: number): boolean {
  const relX = x - startX;
  const relZ = z - startZ;
  // Anywhere within the grid area is drivable ground
  if (relX >= -50 && relX <= totalW + 50 && relZ >= -50 && relZ <= totalH + 50) {
    return true;
  }
  // Ocean area — can't taxi on water, but can crash into it
  return false;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function wrapAngle(a: number): number {
  a = a % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Move angle toward target by at most `rate * dt` */
function moveToward(current: number, target: number, rate: number, dt: number): number {
  const diff = target - current;
  const step = rate * dt;
  if (Math.abs(diff) <= step) return target;
  return current + Math.sign(diff) * step;
}

export interface RemotePlanePos {
  x: number;
  y: number;
  z: number;
}

const PLANE_COLLISION_RADIUS = 8;
const PLANE_COLLISION_DIST = PLANE_COLLISION_RADIUS * 2;

export function findRunwayPosition(): { x: number; z: number; heading: number } {
  // Start on the longest straight road — along the Z axis center road
  const roadCenterX = startX + ROAD_WIDTH_M / 2; // first vertical road
  return {
    x: roadCenterX + GRID_STEP_M * 4, // middle column
    z: startZ + totalH / 2, // middle of grid
    heading: 0, // facing north
  };
}

export function updatePlane(
  state: PlaneState,
  keys: PlaneKeys,
  dt: number,
  remotePlanes?: RemotePlanePos[]
): PlaneState {
  let { x, y, z, heading, pitch, roll, speed, grounded } = state;

  dt = Math.min(dt, 0.1);

  const groundH = getGroundHeight(x, z);

  // ── Throttle / brake ──
  if (keys.w) {
    speed += ACCELERATION * dt;
  } else if (keys.s) {
    if (speed > 0.5) {
      speed -= BRAKE_DECEL * dt;
    } else if (grounded) {
      speed -= ACCELERATION * 0.3 * dt; // slow reverse taxi
    }
  } else {
    const fric = grounded ? GROUND_FRICTION : AIR_FRICTION;
    if (Math.abs(speed) < fric * dt) {
      speed = 0;
    } else {
      speed -= Math.sign(speed) * fric * dt;
    }
  }
  speed = clamp(speed, -REVERSE_MAX, MAX_SPEED);

  // ── Roll (A/D) ──
  if (keys.a) {
    roll -= ROLL_RATE * dt;
  } else if (keys.d) {
    roll += ROLL_RATE * dt;
  } else {
    // Auto-level roll
    roll = moveToward(roll, 0, ROLL_RETURN_RATE, dt);
  }
  roll = clamp(roll, -Math.PI / 2.5, Math.PI / 2.5); // max ~72° bank

  // ── Pitch (Space = nose up, Shift = nose down) ──
  if (!grounded) {
    if (keys.space) {
      pitch += PITCH_RATE * dt;
    } else if (keys.shift) {
      pitch -= PITCH_RATE * dt;
    } else {
      // Gentle return toward level
      pitch = moveToward(pitch, 0, PITCH_RETURN_RATE, dt);
    }
    pitch = clamp(pitch, -Math.PI / 3, Math.PI / 3); // max ±60°
  } else {
    // On ground — pitch toward level, allow slight nose-up for takeoff
    if (keys.space && speed > TAKEOFF_SPEED * 0.7) {
      pitch += PITCH_RATE * 0.5 * dt; // gentle pull-up on ground
      pitch = clamp(pitch, -0.05, 0.3); // limited nose-up on ground
    } else {
      pitch = moveToward(pitch, 0, PITCH_RETURN_RATE * 3, dt);
    }
  }

  // ── Yaw / heading ──
  if (grounded) {
    // On ground: A/D steer like a car (in addition to roll input)
    if (Math.abs(speed) > 0.3) {
      const turnDir = speed >= 0 ? 1 : -1;
      if (keys.a) heading -= GROUND_TURN_RATE * dt * turnDir;
      if (keys.d) heading += GROUND_TURN_RATE * dt * turnDir;
    }
  } else {
    // In air: banking turns — roll angle drives yaw
    heading += roll * YAW_FROM_ROLL * dt;
  }
  heading = wrapAngle(heading);

  // ── Compute movement vector ──
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  const sinH = Math.sin(heading);
  const cosH = Math.cos(heading);

  // Forward direction based on heading + pitch
  const dx = sinH * cosPitch * speed * dt;
  const dz = -cosH * cosPitch * speed * dt;
  let dy = sinPitch * speed * dt; // climbing/descending from pitch

  if (!grounded) {
    // Gravity always pulls down
    dy -= GRAVITY * dt;

    // Lift — proportional to speed and pitch (need speed to stay airborne)
    const liftSpeed = Math.max(0, speed - MIN_FLIGHT_SPEED * 0.5);
    const lift = liftSpeed * LIFT_FACTOR * dt * Math.max(0, cosPitch);
    dy += lift * 0.3; // moderate lift

    // Stall — if too slow in air, nose drops
    if (speed < MIN_FLIGHT_SPEED) {
      const stallFactor = 1 - speed / MIN_FLIGHT_SPEED;
      pitch = moveToward(pitch, -0.4, stallFactor * 2, dt);
    }
  }

  // Apply movement
  const newX = x + dx;
  const newZ = z + dz;
  let newY = y + dy;

  // ── Ground collision ──
  if (newY <= groundH + GROUND_LEVEL) {
    newY = groundH + GROUND_LEVEL;

    if (!grounded) {
      // Landing / crash
      const verticalSpeed = Math.abs(dy / dt);
      if (verticalSpeed > 15) {
        // Hard crash — kill speed
        speed *= 0.2;
        pitch = 0;
        roll = 0;
      } else if (verticalSpeed > 5) {
        // Rough landing
        speed *= 0.7;
      }
      grounded = true;
      pitch = clamp(pitch, -0.05, 0.1);
      roll = 0;
    }

    // Takeoff check
    if (grounded && speed > TAKEOFF_SPEED && pitch > 0.1) {
      grounded = false;
    }
  } else {
    grounded = false;
  }

  // ── Altitude ceiling ──
  if (newY > MAX_ALTITUDE) {
    newY = MAX_ALTITUDE;
    if (pitch > 0) pitch *= 0.9; // push nose down
  }

  // ── Ocean crash — if below water level and outside grid ──
  const OCEAN_Y = -5;
  if (newY < OCEAN_Y + GROUND_LEVEL) {
    newY = OCEAN_Y + GROUND_LEVEL;
    speed *= 0.1;
    grounded = true;
    pitch = 0;
    roll = 0;
  }

  x = newX;
  z = newZ;
  y = newY;

  // ── Plane-to-plane collision ──
  if (remotePlanes) {
    for (const rp of remotePlanes) {
      const ddx = x - rp.x;
      const ddy = y - rp.y;
      const ddz = z - rp.z;
      const dist = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
      if (dist < PLANE_COLLISION_DIST && dist > 0.001) {
        const nx = ddx / dist;
        const ny = ddy / dist;
        const nz = ddz / dist;
        const overlap = PLANE_COLLISION_DIST - dist;
        x += nx * overlap;
        y += ny * overlap;
        z += nz * overlap;
        speed *= 0.3;
      }
    }
  }

  return { x, y, z, heading, pitch, roll, speed, grounded };
}
