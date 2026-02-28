import * as THREE from "three";

/**
 * Animated cloud dome using a canvas-generated noise texture.
 * Renders as a transparent hemisphere above the scene that slowly rotates.
 * No custom GLSL — uses standard Three.js materials for maximum compatibility.
 */

const CLOUD_SIZE = 512;

/** Generate a tileable cloud noise texture on a 2D canvas */
function generateCloudCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = CLOUD_SIZE;
  canvas.height = CLOUD_SIZE;
  const ctx = canvas.getContext("2d")!;

  // Simple value noise via layered radial gradients (cheap FBM approximation)
  const imageData = ctx.createImageData(CLOUD_SIZE, CLOUD_SIZE);
  const data = imageData.data;

  // Seed some random blobs
  const blobs: { x: number; y: number; r: number; strength: number }[] = [];
  const rng = mulberry32(42); // deterministic seed
  for (let i = 0; i < 60; i++) {
    blobs.push({
      x: rng() * CLOUD_SIZE,
      y: rng() * CLOUD_SIZE,
      r: 40 + rng() * 120,
      strength: 0.3 + rng() * 0.7,
    });
  }

  for (let py = 0; py < CLOUD_SIZE; py++) {
    for (let px = 0; px < CLOUD_SIZE; px++) {
      let val = 0;
      for (const b of blobs) {
        // Tileable distance (wrapping)
        let dx = Math.abs(px - b.x);
        let dy = Math.abs(py - b.y);
        if (dx > CLOUD_SIZE / 2) dx = CLOUD_SIZE - dx;
        if (dy > CLOUD_SIZE / 2) dy = CLOUD_SIZE - dy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < b.r) {
          // Smooth falloff
          const t = 1 - dist / b.r;
          val += t * t * b.strength;
        }
      }
      // Clamp and map to alpha
      val = Math.min(val, 1);
      const idx = (py * CLOUD_SIZE + px) * 4;
      data[idx] = 255;     // R
      data[idx + 1] = 255; // G
      data[idx + 2] = 255; // B
      data[idx + 3] = Math.floor(val * 180); // A — semi-transparent
    }
  }

  ctx.putImageData(imageData, 0, 0);

  // Blur pass for softness
  ctx.filter = "blur(8px)";
  ctx.drawImage(canvas, 0, 0);
  ctx.filter = "none";

  return canvas;
}

/** Simple deterministic PRNG */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface CloudDome {
  mesh: THREE.Mesh;
  update(elapsed: number, camera?: THREE.Camera): void;
  dispose(): void;
}

export function createCloudDome(): CloudDome {
  const cloudCanvas = generateCloudCanvas();

  const texture = new THREE.CanvasTexture(cloudCanvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);

  const geo = new THREE.SphereGeometry(800, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.45);
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.6,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -999;

  return {
    mesh,
    update(elapsed: number, camera?: THREE.Camera) {
      // Slow drift
      texture.offset.x = elapsed * 0.003;
      texture.offset.y = elapsed * 0.001;
      // Keep centered on camera
      if (camera) {
        mesh.position.copy(camera.position);
      }
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      texture.dispose();
    },
  };
}
