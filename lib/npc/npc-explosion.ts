import * as THREE from "three";

const MAX_EXPLOSIONS = 3;
const FIREBALL_COUNT = 10;
const DEBRIS_COUNT = 5;
const FIREBALL_LIFETIME = 0.5; // seconds
const DEBRIS_LIFETIME = 1.0;
const GRAVITY = -20;

interface Particle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  lifetime: number;
}

interface Explosion {
  active: boolean;
  age: number;
  fireballs: Particle[];
  debris: Particle[];
}

// Shared geometries & materials (created once)
let fireballGeo: THREE.SphereGeometry;
let fireballMats: THREE.MeshBasicMaterial[];
let debrisGeo: THREE.BoxGeometry;
let debrisMat: THREE.MeshStandardMaterial;

function ensureShared() {
  if (fireballGeo) return;
  fireballGeo = new THREE.SphereGeometry(0.3, 4, 3);
  fireballMats = [
    new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, depthWrite: false }),
    new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, depthWrite: false }),
    new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, depthWrite: false }),
  ];
  debrisGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  debrisMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 });
}

function createParticle(
  geo: THREE.BufferGeometry,
  mat: THREE.Material
): Particle {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.visible = false;
  return { mesh, vx: 0, vy: 0, vz: 0, age: 0, lifetime: 0 };
}

export class ExplosionPool {
  group: THREE.Group;
  private explosions: Explosion[] = [];

  constructor() {
    ensureShared();
    this.group = new THREE.Group();
    this.group.name = "npc-explosions";

    for (let i = 0; i < MAX_EXPLOSIONS; i++) {
      const fireballs: Particle[] = [];
      for (let j = 0; j < FIREBALL_COUNT; j++) {
        const mat = fireballMats[j % fireballMats.length];
        const p = createParticle(fireballGeo, mat);
        this.group.add(p.mesh);
        fireballs.push(p);
      }

      const debris: Particle[] = [];
      for (let j = 0; j < DEBRIS_COUNT; j++) {
        const p = createParticle(debrisGeo, debrisMat);
        this.group.add(p.mesh);
        debris.push(p);
      }

      this.explosions.push({ active: false, age: 0, fireballs, debris });
    }
  }

  /** Trigger an explosion at (x, z) on the ground plane */
  trigger(x: number, z: number): void {
    // Find inactive slot or reuse oldest
    let slot = this.explosions.find((e) => !e.active);
    if (!slot) {
      // Reuse oldest
      let oldest = this.explosions[0];
      for (const e of this.explosions) {
        if (e.age > oldest.age) oldest = e;
      }
      slot = oldest;
    }

    slot.active = true;
    slot.age = 0;

    // Init fireballs — radial burst
    for (const p of slot.fireballs) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 8;
      p.vx = Math.cos(angle) * speed;
      p.vy = 5 + Math.random() * 10;
      p.vz = Math.sin(angle) * speed;
      p.age = 0;
      p.lifetime = FIREBALL_LIFETIME * (0.7 + Math.random() * 0.6);
      p.mesh.position.set(x, 0.5, z);
      p.mesh.scale.setScalar(0.5 + Math.random() * 1.5);
      p.mesh.visible = true;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 1;
    }

    // Init debris — heavier, less velocity
    for (const p of slot.debris) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 5;
      p.vx = Math.cos(angle) * speed;
      p.vy = 4 + Math.random() * 6;
      p.vz = Math.sin(angle) * speed;
      p.age = 0;
      p.lifetime = DEBRIS_LIFETIME;
      p.mesh.position.set(x, 0.5, z);
      p.mesh.visible = true;
    }
  }

  /** Update all active explosions. Returns true if any are active. */
  update(dt: number): boolean {
    let anyActive = false;

    for (const exp of this.explosions) {
      if (!exp.active) continue;
      exp.age += dt;
      let allDone = true;

      for (const p of exp.fireballs) {
        if (p.age >= p.lifetime) {
          p.mesh.visible = false;
          continue;
        }
        allDone = false;
        p.age += dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.vy += GRAVITY * 0.3 * dt; // light gravity for fireballs
        // Expand + fade
        const t = p.age / p.lifetime;
        p.mesh.scale.setScalar((0.5 + t * 2) * (1 + Math.random() * 0.2));
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - t;
      }

      for (const p of exp.debris) {
        if (p.age >= p.lifetime) {
          p.mesh.visible = false;
          continue;
        }
        allDone = false;
        p.age += dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.vy += GRAVITY * dt;
        // Tumble
        p.mesh.rotation.x += 5 * dt;
        p.mesh.rotation.z += 3 * dt;
        // Stop at ground
        if (p.mesh.position.y < 0) {
          p.mesh.position.y = 0;
          p.vy = 0;
          p.vx *= 0.5;
          p.vz *= 0.5;
        }
      }

      if (allDone) {
        exp.active = false;
      } else {
        anyActive = true;
      }
    }

    return anyActive;
  }

  dispose(): void {
    for (const exp of this.explosions) {
      for (const p of [...exp.fireballs, ...exp.debris]) {
        // geometry is shared, don't dispose
        p.mesh.removeFromParent();
      }
    }
  }
}
