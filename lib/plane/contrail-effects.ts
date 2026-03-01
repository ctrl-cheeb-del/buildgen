import * as THREE from "three";

/**
 * Contrail / vapor trail effects for the plane.
 * Two thin white trails from the wingtips that fade over time.
 */

const TRAIL_MAX = 600;
const TRAIL_WIDTH = 0.4;
const TRAIL_LENGTH = 1.0;
const TRAIL_FADE_TIME = 3;
const WING_HALF_SPAN = 5; // meters from center to wingtip

const _mat4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);

interface TrailSlot {
  birth: number;
  active: boolean;
}

function createTrailSystem(parent: THREE.Group) {
  const geo = new THREE.PlaneGeometry(TRAIL_WIDTH, TRAIL_LENGTH);
  // default XY plane — we'll orient each instance via matrix

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
        gl_FragColor = vec4(0.95, 0.95, 1.0, vOpacity * 0.6);
      }
    `,
  });

  const mesh = new THREE.InstancedMesh(geo, mat, TRAIL_MAX);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.count = 0;
  parent.add(mesh);

  const opacities = new Float32Array(TRAIL_MAX);
  const opacityAttr = new THREE.InstancedBufferAttribute(opacities, 1);
  opacityAttr.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.setAttribute("instanceOpacity", opacityAttr);

  const slots: TrailSlot[] = [];
  for (let i = 0; i < TRAIL_MAX; i++) {
    slots.push({ birth: -9999, active: false });
    _mat4.makeScale(0, 0, 0);
    mesh.setMatrixAt(i, _mat4);
  }
  mesh.instanceMatrix.needsUpdate = true;

  let nextSlot = 0;

  function stamp(x: number, y: number, z: number, heading: number, pitch: number, now: number) {
    const i = nextSlot % TRAIL_MAX;
    nextSlot++;

    _pos.set(x, y, z);
    // Orient the trail quad to face roughly camera-ward (billboard-ish)
    // Use Euler: rotate around Y by heading, then slight X tilt
    _quat.setFromEuler(new THREE.Euler(-pitch, heading, 0, "YXZ"));
    _scale.set(1, 1, 1);
    _mat4.compose(_pos, _quat, _scale);
    mesh.setMatrixAt(i, _mat4);

    slots[i].birth = now;
    slots[i].active = true;

    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = Math.min(nextSlot, TRAIL_MAX);
  }

  function update(now: number) {
    const count = Math.min(nextSlot, TRAIL_MAX);
    let anyChange = false;
    for (let i = 0; i < count; i++) {
      if (!slots[i].active) {
        opacities[i] = 0;
        continue;
      }
      const age = now - slots[i].birth;
      if (age > TRAIL_FADE_TIME) {
        opacities[i] = 0;
        slots[i].active = false;
        _mat4.makeScale(0, 0, 0);
        mesh.setMatrixAt(i, _mat4);
        mesh.instanceMatrix.needsUpdate = true;
      } else {
        opacities[i] = 1 - age / TRAIL_FADE_TIME;
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

// ---------- public API ----------

export interface ContrailEffects {
  group: THREE.Group;
  update: (
    planeX: number,
    planeY: number,
    planeZ: number,
    heading: number,
    pitch: number,
    roll: number,
    speed: number,
    grounded: boolean,
    dt: number,
    now: number
  ) => void;
  dispose: () => void;
}

export function createContrailEffects(): ContrailEffects {
  const group = new THREE.Group();
  group.name = "contrail-effects";

  const trails = createTrailSystem(group);

  function update(
    planeX: number,
    planeY: number,
    planeZ: number,
    heading: number,
    pitch: number,
    roll: number,
    speed: number,
    grounded: boolean,
    _dt: number,
    now: number
  ) {
    trails.update(now);

    // Only emit contrails when flying at decent speed and altitude
    if (grounded || speed < 15 || planeY < 5) return;

    const sinH = Math.sin(heading);
    const cosH = Math.cos(heading);
    const cosR = Math.cos(roll);
    const sinR = Math.sin(roll);

    // Wingtip positions (perpendicular to heading, rotated by roll)
    for (const side of [-1, 1]) {
      const wingX = planeX + (cosH * cosR * side) * WING_HALF_SPAN;
      const wingY = planeY - (sinR * side) * WING_HALF_SPAN;
      const wingZ = planeZ + (sinH * cosR * side) * WING_HALF_SPAN;
      trails.stamp(wingX, wingY, wingZ, heading, pitch, now);
    }
  }

  function dispose() {
    trails.dispose();
  }

  return { group, update, dispose };
}
