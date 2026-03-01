import * as THREE from "three";

/**
 * Wake effects for boat: water spray particles + wake trail marks on the water surface.
 */

// ---------- config ----------

const WAKE_MARK_MAX = 400;
const WAKE_MARK_LENGTH = 1.5;
const WAKE_MARK_WIDTH = 0.6;
const WAKE_MARK_Y = -5.5; // just above ocean surface (ocean is at y=-6)
const WAKE_MARK_FADE_TIME = 3;
const REAR_OFFSET = 4;
const REAR_HALF_WIDTH = 2;

const SPRAY_POOL_SIZE = 24;
const SPRAY_SIZE = 2.5;
const SPRAY_LIFETIME = 0.7;
const SPRAY_SPAWN_INTERVAL = 0.06;

// ---------- wake marks (InstancedMesh) ----------

const _mat4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);

interface WakeSlot {
  birth: number;
  active: boolean;
}

function createWakeMarkSystem(parent: THREE.Group) {
  const geo = new THREE.PlaneGeometry(WAKE_MARK_WIDTH, WAKE_MARK_LENGTH);
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
        gl_FragColor = vec4(0.7, 0.85, 0.95, vOpacity * 0.5);
      }
    `,
  });

  const mesh = new THREE.InstancedMesh(geo, mat, WAKE_MARK_MAX);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  mesh.count = 0;
  parent.add(mesh);

  const opacities = new Float32Array(WAKE_MARK_MAX);
  const opacityAttr = new THREE.InstancedBufferAttribute(opacities, 1);
  opacityAttr.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.setAttribute("instanceOpacity", opacityAttr);

  const slots: WakeSlot[] = [];
  for (let i = 0; i < WAKE_MARK_MAX; i++) {
    slots.push({ birth: -9999, active: false });
    _mat4.makeScale(0, 0, 0);
    mesh.setMatrixAt(i, _mat4);
  }
  mesh.instanceMatrix.needsUpdate = true;

  let nextSlot = 0;

  function stamp(x: number, z: number, heading: number, now: number) {
    const i = nextSlot % WAKE_MARK_MAX;
    nextSlot++;

    _pos.set(x, WAKE_MARK_Y, z);
    _quat.setFromAxisAngle(_up, heading);
    _scale.set(1, 1, 1);
    _mat4.compose(_pos, _quat, _scale);
    mesh.setMatrixAt(i, _mat4);

    slots[i].birth = now;
    slots[i].active = true;

    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = Math.min(nextSlot, WAKE_MARK_MAX);
  }

  function update(now: number) {
    const count = Math.min(nextSlot, WAKE_MARK_MAX);
    let anyChange = false;
    for (let i = 0; i < count; i++) {
      if (!slots[i].active) {
        opacities[i] = 0;
        continue;
      }
      const age = now - slots[i].birth;
      if (age > WAKE_MARK_FADE_TIME) {
        opacities[i] = 0;
        slots[i].active = false;
        _mat4.makeScale(0, 0, 0);
        mesh.setMatrixAt(i, _mat4);
        mesh.instanceMatrix.needsUpdate = true;
      } else {
        opacities[i] = 1 - age / WAKE_MARK_FADE_TIME;
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

// ---------- spray particles ----------

interface SprayParticle {
  mesh: THREE.Mesh;
  alive: boolean;
  birth: number;
  vx: number;
  vy: number;
  vz: number;
}

function createSprayPool(parent: THREE.Group): SprayParticle[] {
  const pool: SprayParticle[] = [];
  const geo = new THREE.PlaneGeometry(SPRAY_SIZE, SPRAY_SIZE);
  for (let i = 0; i < SPRAY_POOL_SIZE; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xddeeff,
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

function spawnSpray(pool: SprayParticle[], x: number, y: number, z: number, now: number) {
  const p = pool.find((s) => !s.alive);
  if (!p) return;
  p.alive = true;
  p.birth = now;
  p.vx = (Math.random() - 0.5) * 2;
  p.vy = 1.5 + Math.random() * 1.5;
  p.vz = (Math.random() - 0.5) * 2;
  p.mesh.position.set(x, y, z);
  p.mesh.visible = true;
  (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.35;
  const s = SPRAY_SIZE * (0.4 + Math.random() * 0.3);
  p.mesh.scale.set(s, s, s);
}

function updateSpray(pool: SprayParticle[], dt: number, now: number) {
  for (const p of pool) {
    if (!p.alive) continue;
    const age = now - p.birth;
    if (age > SPRAY_LIFETIME) {
      p.alive = false;
      p.mesh.visible = false;
      continue;
    }
    const t = age / SPRAY_LIFETIME;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.3 * (1 - t);
    const grow = 1 + t * 1.5;
    p.mesh.scale.set(SPRAY_SIZE * grow, SPRAY_SIZE * grow, SPRAY_SIZE * grow);
    p.mesh.rotation.x = -Math.PI / 2;
  }
}

// ---------- public API ----------

export interface WakeEffects {
  group: THREE.Group;
  update: (
    boatX: number,
    boatZ: number,
    heading: number,
    drifting: boolean,
    driftAngle: number,
    speed: number,
    dt: number,
    now: number
  ) => void;
  dispose: () => void;
}

export function createWakeEffects(): WakeEffects {
  const group = new THREE.Group();
  group.name = "wake-effects";

  const marks = createWakeMarkSystem(group);
  const sprayPool = createSprayPool(group);
  let lastSprayTime = 0;

  function update(
    boatX: number,
    boatZ: number,
    heading: number,
    drifting: boolean,
    driftAngle: number,
    speed: number,
    dt: number,
    now: number
  ) {
    updateSpray(sprayPool, dt, now);

    const absSpeed = Math.abs(speed);
    const absDrift = Math.abs(driftAngle);

    // Always leave a wake trail when moving at reasonable speed
    if (absSpeed > 3) {
      const cosH = Math.cos(heading);
      const sinH = Math.sin(heading);
      const rearX = boatX + sinH * REAR_OFFSET;
      const rearZ = boatZ + cosH * REAR_OFFSET;
      const perpX = cosH;
      const perpZ = -sinH;

      const leftX = rearX - perpX * REAR_HALF_WIDTH;
      const leftZ = rearZ - perpZ * REAR_HALF_WIDTH;
      const rightX = rearX + perpX * REAR_HALF_WIDTH;
      const rightZ = rearZ + perpZ * REAR_HALF_WIDTH;

      // Wake marks (always when moving)
      marks.stamp(leftX, leftZ, heading, now);
      marks.stamp(rightX, rightZ, heading, now);

      // Spray — more when drifting or at speed
      const sprayInterval = drifting ? SPRAY_SPAWN_INTERVAL : SPRAY_SPAWN_INTERVAL * 2;
      if (now - lastSprayTime > sprayInterval && absSpeed > 6) {
        lastSprayTime = now;
        const sx = Math.random() > 0.5 ? leftX : rightX;
        const sz = Math.random() > 0.5 ? leftZ : rightZ;
        spawnSpray(sprayPool, sx, -5, sz, now);
      }
    }

    marks.update(now);
  }

  function dispose() {
    marks.dispose();
    for (const p of sprayPool) {
      (p.mesh.material as THREE.Material).dispose();
    }
    if (sprayPool.length > 0) {
      sprayPool[0].mesh.geometry.dispose();
    }
  }

  return { group, update, dispose };
}
