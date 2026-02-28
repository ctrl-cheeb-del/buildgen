import * as THREE from "three";

/**
 * Drift effects: tire marks (instanced quads) + smoke (mesh pool).
 *
 * Tire marks are individual small rectangles stamped on the road — no ribbons,
 * no connectivity between separate drifts. Each mark fades independently.
 */

// ---------- config ----------

const MARK_MAX = 500;
const MARK_LENGTH = 1.2; // along driving direction
const MARK_WIDTH = 0.35;
const MARK_Y = 0.06;
const MARK_FADE_TIME = 4;
const REAR_AXLE_OFFSET = 2.5;
const REAR_HALF_WIDTH = 1.2;

const SMOKE_POOL_SIZE = 32;
const SMOKE_SIZE = 2.2;
const SMOKE_LIFETIME = 0.9;
const SMOKE_SPAWN_INTERVAL = 0.07;

// ---------- tire marks (InstancedMesh) ----------

const _mat4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);

interface MarkSlot {
  birth: number;
  active: boolean;
}

function createTireMarkSystem(parent: THREE.Group) {
  const geo = new THREE.PlaneGeometry(MARK_WIDTH, MARK_LENGTH);
  // Rotate plane to lie flat on XZ (plane default is XY)
  geo.rotateX(-Math.PI / 2);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {},
    vertexShader: /* glsl */ `
      attribute float instanceOpacity;
      varying float vOpacity;
      void main() {
        vOpacity = instanceOpacity;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vOpacity;
      void main() {
        if (vOpacity < 0.01) discard;
        gl_FragColor = vec4(0.13, 0.13, 0.13, vOpacity * 0.7);
      }
    `,
  });

  const mesh = new THREE.InstancedMesh(geo, mat, MARK_MAX);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  mesh.count = 0;
  parent.add(mesh);

  const opacities = new Float32Array(MARK_MAX);
  const opacityAttr = new THREE.InstancedBufferAttribute(opacities, 1);
  opacityAttr.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.setAttribute("instanceOpacity", opacityAttr);

  const slots: MarkSlot[] = [];
  for (let i = 0; i < MARK_MAX; i++) {
    slots.push({ birth: -9999, active: false });
    // Initialize all transforms to zero-scale so invisible
    _mat4.makeScale(0, 0, 0);
    mesh.setMatrixAt(i, _mat4);
  }
  mesh.instanceMatrix.needsUpdate = true;

  let nextSlot = 0;

  function stamp(x: number, z: number, heading: number, now: number) {
    const i = nextSlot % MARK_MAX;
    nextSlot++;

    _pos.set(x, MARK_Y, z);
    _quat.setFromAxisAngle(_up, heading);
    _scale.set(1, 1, 1);
    _mat4.compose(_pos, _quat, _scale);
    mesh.setMatrixAt(i, _mat4);

    slots[i].birth = now;
    slots[i].active = true;

    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = Math.min(nextSlot, MARK_MAX);
  }

  function update(now: number) {
    const count = Math.min(nextSlot, MARK_MAX);
    let anyChange = false;
    for (let i = 0; i < count; i++) {
      if (!slots[i].active) {
        opacities[i] = 0;
        continue;
      }
      const age = now - slots[i].birth;
      if (age > MARK_FADE_TIME) {
        opacities[i] = 0;
        slots[i].active = false;
        // Shrink to zero so it doesn't interfere
        _mat4.makeScale(0, 0, 0);
        mesh.setMatrixAt(i, _mat4);
        mesh.instanceMatrix.needsUpdate = true;
      } else {
        opacities[i] = 1 - age / MARK_FADE_TIME;
      }
      anyChange = true;
    }
    if (anyChange) {
      opacityAttr.needsUpdate = true;
    }
  }

  function dispose() {
    geo.dispose();
    mat.dispose();
  }

  return { stamp, update, dispose };
}

// ---------- smoke ----------

interface SmokeParticle {
  mesh: THREE.Mesh;
  alive: boolean;
  birth: number;
  vx: number;
  vy: number;
  vz: number;
}

function createSmokePool(parent: THREE.Group): SmokeParticle[] {
  const pool: SmokeParticle[] = [];
  const geo = new THREE.PlaneGeometry(SMOKE_SIZE, SMOKE_SIZE);
  for (let i = 0; i < SMOKE_POOL_SIZE; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xbbbbbb,
      transparent: true,
      depthWrite: false,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    mesh.renderOrder = 1;
    parent.add(mesh);
    pool.push({ mesh, alive: false, birth: 0, vx: 0, vy: 0, vz: 0 });
  }
  return pool;
}

function spawnSmoke(pool: SmokeParticle[], x: number, z: number, now: number) {
  const p = pool.find((s) => !s.alive);
  if (!p) return;
  p.alive = true;
  p.birth = now;
  p.vx = (Math.random() - 0.5) * 1.5;
  p.vy = 1.0 + Math.random() * 1.0;
  p.vz = (Math.random() - 0.5) * 1.5;
  p.mesh.position.set(x, 0.5, z);
  p.mesh.visible = true;
  (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.3;
  const s = SMOKE_SIZE * (0.5 + Math.random() * 0.3);
  p.mesh.scale.set(s, s, s);
}

function updateSmoke(pool: SmokeParticle[], dt: number, now: number) {
  for (const p of pool) {
    if (!p.alive) continue;
    const age = now - p.birth;
    if (age > SMOKE_LIFETIME) {
      p.alive = false;
      p.mesh.visible = false;
      continue;
    }
    const t = age / SMOKE_LIFETIME;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.25 * (1 - t);
    const grow = 1 + t * 1.2;
    p.mesh.scale.set(SMOKE_SIZE * grow, SMOKE_SIZE * grow, SMOKE_SIZE * grow);
    p.mesh.rotation.x = -Math.PI / 2;
  }
}

// ---------- public API ----------

export interface DriftEffects {
  group: THREE.Group;
  update: (
    carX: number,
    carZ: number,
    heading: number,
    drifting: boolean,
    driftAngle: number,
    speed: number,
    dt: number,
    now: number
  ) => void;
  dispose: () => void;
}

export function createDriftEffects(): DriftEffects {
  const group = new THREE.Group();
  group.name = "drift-effects";

  const marks = createTireMarkSystem(group);
  const smokePool = createSmokePool(group);
  let lastSmokeTime = 0;

  function update(
    carX: number,
    carZ: number,
    heading: number,
    drifting: boolean,
    driftAngle: number,
    speed: number,
    dt: number,
    now: number
  ) {
    updateSmoke(smokePool, dt, now);

    const absDrift = Math.abs(driftAngle);
    const isDrifting = drifting && absDrift > 0.1 && speed > 5;

    if (isDrifting) {
      const cosH = Math.cos(heading);
      const sinH = Math.sin(heading);
      const rearX = carX + sinH * REAR_AXLE_OFFSET;
      const rearZ = carZ + cosH * REAR_AXLE_OFFSET;
      const perpX = cosH;
      const perpZ = -sinH;

      const leftX = rearX - perpX * REAR_HALF_WIDTH;
      const leftZ = rearZ - perpZ * REAR_HALF_WIDTH;
      const rightX = rearX + perpX * REAR_HALF_WIDTH;
      const rightZ = rearZ + perpZ * REAR_HALF_WIDTH;

      // Stamp independent tire mark quads
      marks.stamp(leftX, leftZ, heading, now);
      marks.stamp(rightX, rightZ, heading, now);

      // Smoke — spawn from one random wheel per interval
      if (now - lastSmokeTime > SMOKE_SPAWN_INTERVAL) {
        lastSmokeTime = now;
        spawnSmoke(smokePool, Math.random() > 0.5 ? leftX : rightX, Math.random() > 0.5 ? leftZ : rightZ, now);
      }
    }

    // Fade & cleanup old marks
    marks.update(now);
  }

  function dispose() {
    marks.dispose();
    for (const p of smokePool) {
      (p.mesh.material as THREE.Material).dispose();
    }
    if (smokePool.length > 0) {
      smokePool[0].mesh.geometry.dispose();
    }
  }

  return { group, update, dispose };
}
