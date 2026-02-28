import * as THREE from "three";

/**
 * Spinning ASCII wireframe cube placeholder.
 * Shown on a plot while a build is generating.
 * Uses a canvas texture with ASCII box-drawing characters
 * rendered onto cube faces, plus a glow post-effect via
 * additive blending on a slightly scaled-up copy.
 */

const ASCII_CHARS = "01@#$%&*+=~<>{}[]|/\\:;!?";
const CUBE_SIZE = 20; // meters — visible but not huge
const SPIN_SPEED = 0.8; // radians/sec

interface PlaceholderInstance {
  group: THREE.Group;
  update: (elapsed: number) => void;
  dispose: () => void;
}

/** Create a canvas texture with random ASCII characters */
function createASCIITexture(size: number = 256): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  // Dark background with slight transparency
  ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
  ctx.fillRect(0, 0, size, size);

  // Draw ASCII grid
  const fontSize = 14;
  const cols = Math.floor(size / (fontSize * 0.7));
  const rows = Math.floor(size / fontSize);
  ctx.font = `${fontSize}px monospace`;
  ctx.textBaseline = "top";

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Vary brightness for depth feel
      const brightness = 40 + Math.random() * 180;
      const green = Math.floor(brightness * 0.9 + Math.random() * 40);
      const blue = Math.floor(brightness * 1.1);
      ctx.fillStyle = `rgb(${Math.floor(brightness * 0.3)}, ${green}, ${blue})`;
      const char = ASCII_CHARS[Math.floor(Math.random() * ASCII_CHARS.length)];
      ctx.fillText(char, c * fontSize * 0.7, r * fontSize);
    }
  }

  // Draw border with box-drawing style
  ctx.strokeStyle = "rgba(100, 220, 255, 0.8)";
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, size - 8, size - 8);

  // Corner accents
  const cornerSize = 20;
  ctx.strokeStyle = "rgba(140, 255, 255, 0.9)";
  ctx.lineWidth = 3;
  // Top-left
  ctx.beginPath();
  ctx.moveTo(2, cornerSize);
  ctx.lineTo(2, 2);
  ctx.lineTo(cornerSize, 2);
  ctx.stroke();
  // Top-right
  ctx.beginPath();
  ctx.moveTo(size - cornerSize, 2);
  ctx.lineTo(size - 2, 2);
  ctx.lineTo(size - 2, cornerSize);
  ctx.stroke();
  // Bottom-left
  ctx.beginPath();
  ctx.moveTo(2, size - cornerSize);
  ctx.lineTo(2, size - 2);
  ctx.lineTo(cornerSize, size - 2);
  ctx.stroke();
  // Bottom-right
  ctx.beginPath();
  ctx.moveTo(size - cornerSize, size - 2);
  ctx.lineTo(size - 2, size - 2);
  ctx.lineTo(size - 2, size - cornerSize);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

/** Refresh the ASCII characters on the texture (for animation) */
function refreshASCIITexture(texture: THREE.CanvasTexture) {
  const canvas = texture.image as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  const size = canvas.width;

  // Only redraw the character area (keep border)
  ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
  ctx.fillRect(6, 6, size - 12, size - 12);

  const fontSize = 14;
  const cols = Math.floor(size / (fontSize * 0.7));
  const rows = Math.floor(size / fontSize);
  ctx.font = `${fontSize}px monospace`;
  ctx.textBaseline = "top";

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const brightness = 40 + Math.random() * 180;
      const green = Math.floor(brightness * 0.9 + Math.random() * 40);
      const blue = Math.floor(brightness * 1.1);
      ctx.fillStyle = `rgb(${Math.floor(brightness * 0.3)}, ${green}, ${blue})`;
      const char = ASCII_CHARS[Math.floor(Math.random() * ASCII_CHARS.length)];
      ctx.fillText(char, c * fontSize * 0.7, r * fontSize);
    }
  }

  texture.needsUpdate = true;
}

export function createLoadingPlaceholder(): PlaceholderInstance {
  const group = new THREE.Group();
  group.name = "loading-placeholder";

  const texture = createASCIITexture();

  // Inner cube — ASCII textured faces
  const geo = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
  });
  const cube = new THREE.Mesh(geo, mat);
  group.add(cube);

  // Wireframe overlay — bright edges
  const wireGeo = new THREE.BoxGeometry(
    CUBE_SIZE * 1.01,
    CUBE_SIZE * 1.01,
    CUBE_SIZE * 1.01
  );
  const wireMat = new THREE.MeshBasicMaterial({
    color: 0x66ddff,
    wireframe: true,
    transparent: true,
    opacity: 0.7,
  });
  const wireframe = new THREE.Mesh(wireGeo, wireMat);
  group.add(wireframe);

  // Glow cube — slightly larger, additive blending
  const glowGeo = new THREE.BoxGeometry(
    CUBE_SIZE * 1.15,
    CUBE_SIZE * 1.15,
    CUBE_SIZE * 1.15
  );
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0x44aaff,
    transparent: true,
    opacity: 0.15,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  group.add(glow);

  // Tilt on diagonal axis (like a spinning die)
  const pivot = new THREE.Group();
  pivot.name = "loading-pivot";
  pivot.rotation.x = Math.PI / 6; // ~30° tilt
  pivot.rotation.z = Math.PI / 6;
  pivot.add(group);

  // Float slightly above ground
  pivot.position.y = CUBE_SIZE;

  // Track last texture refresh
  let lastRefresh = 0;

  const update = (elapsed: number) => {
    // Spin around Y axis
    group.rotation.y = elapsed * SPIN_SPEED;

    // Gentle bob above ground
    pivot.position.y = CUBE_SIZE + Math.sin(elapsed * 1.2) * 2;

    // Pulse glow
    glowMat.opacity = 0.1 + Math.sin(elapsed * 2.5) * 0.08;
    wireMat.opacity = 0.5 + Math.sin(elapsed * 3) * 0.3;

    // Refresh ASCII characters every ~0.4s
    if (elapsed - lastRefresh > 0.4) {
      lastRefresh = elapsed;
      refreshASCIITexture(texture);
    }
  };

  const dispose = () => {
    geo.dispose();
    mat.dispose();
    wireGeo.dispose();
    wireMat.dispose();
    glowGeo.dispose();
    glowMat.dispose();
    texture.dispose();
  };

  return { group: pivot, update, dispose };
}
