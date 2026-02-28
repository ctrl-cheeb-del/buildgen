import * as THREE from "three";
import {
  GRID_COLS,
  GRID_ROWS,
  PLOT_SIZE_M,
  ROAD_WIDTH_M,
  PAVEMENT_WIDTH_M,
  GRID_STEP_M,
} from "@/lib/grid/grid-constants";
import { loadTileableTexture, loadTileableNormalMap } from "./texture-loader";

/**
 * Build all textured ground-plane meshes (roads, pavements, plots)
 * and return them as a single THREE.Group positioned at origin.
 *
 * This replaces the flat-color Mapbox 2D layers with actual
 * textured 3D surfaces that match the grid layout.
 */
export function buildGroundPlanes(): THREE.Group {
  const ground = new THREE.Group();
  ground.name = "ground-planes";

  // Grid extents in meters (same math as grid-geometry.ts)
  const totalW = GRID_COLS * PLOT_SIZE_M + (GRID_COLS + 1) * ROAD_WIDTH_M;
  const totalH = GRID_ROWS * PLOT_SIZE_M + (GRID_ROWS + 1) * ROAD_WIDTH_M;
  const startX = -totalW / 2;
  const startZ = -totalH / 2;

  // ── Materials ─────────────────────────────────────────────

  const asphaltTex = loadTileableTexture("/textures/asphalt.webp", 6);
  const asphaltNorm = loadTileableNormalMap("/textures/asphalt-normal.webp", 6);
  const roadMat = new THREE.MeshPhysicalMaterial({
    map: asphaltTex,
    normalMap: asphaltNorm,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 0.92,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  const pavementTex = loadTileableTexture("/textures/pavement-slabs.webp", 8);
  const pavementNorm = loadTileableNormalMap("/textures/pavement-slabs-normal.webp", 8);
  const pavementMat = new THREE.MeshPhysicalMaterial({
    map: pavementTex,
    normalMap: pavementNorm,
    normalScale: new THREE.Vector2(1.3, 1.3),
    roughness: 0.85,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  const grassTex = loadTileableTexture("/textures/grass.webp", 4);
  const grassNorm = loadTileableNormalMap("/textures/grass-normal.webp", 4);
  const plotMat = new THREE.MeshPhysicalMaterial({
    map: grassTex,
    normalMap: grassNorm,
    normalScale: new THREE.Vector2(0.25, 0.25),
    roughness: 0.95,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  // Kerb height: pavement sits this much above the road surface
  const KERB_HEIGHT = 0.15; // ~15cm real-world kerb

  // Helper: clone material + textures with per-plane repeat settings
  function cloneMat(mat: THREE.MeshPhysicalMaterial, w: number, h: number, baseRepeat: number) {
    const clonedMat = mat.clone();
    const repeatX = baseRepeat * (w / 30);
    const repeatY = baseRepeat * (h / 30);
    if (mat.map) {
      clonedMat.map = mat.map.clone();
      clonedMat.map.wrapS = THREE.RepeatWrapping;
      clonedMat.map.wrapT = THREE.RepeatWrapping;
      clonedMat.map.repeat.set(repeatX, repeatY);
      clonedMat.map.needsUpdate = true;
    }
    if (mat.normalMap) {
      clonedMat.normalMap = mat.normalMap.clone();
      clonedMat.normalMap.wrapS = THREE.RepeatWrapping;
      clonedMat.normalMap.wrapT = THREE.RepeatWrapping;
      clonedMat.normalMap.repeat.set(repeatX, repeatY);
      clonedMat.normalMap.needsUpdate = true;
    }
    return clonedMat;
  }

  // Flat plane (used for roads)
  function addPlane(
    mat: THREE.MeshPhysicalMaterial,
    x: number,
    z: number,
    w: number,
    h: number,
    yOffset: number,
    baseRepeat: number
  ) {
    const geo = new THREE.PlaneGeometry(w, h);
    const mesh = new THREE.Mesh(geo, cloneMat(mat, w, h, baseRepeat));
    mesh.receiveShadow = true;
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x + w / 2, yOffset, z + h / 2);
    ground.add(mesh);
  }

  // Thin box (used for pavements — has visible kerb edge)
  function addRaisedPlane(
    mat: THREE.MeshPhysicalMaterial,
    x: number,
    z: number,
    w: number,
    h: number,
    yBase: number,
    thickness: number,
    baseRepeat: number
  ) {
    const geo = new THREE.BoxGeometry(w, thickness, h);
    const mesh = new THREE.Mesh(geo, cloneMat(mat, w, h, baseRepeat));
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    // Box is centered on origin — shift up so bottom sits at yBase
    mesh.position.set(x + w / 2, yBase + thickness / 2, z + h / 2);
    ground.add(mesh);
  }

  // ── Horizontal roads (GRID_ROWS + 1 strips) ──────────────

  for (let r = 0; r <= GRID_ROWS; r++) {
    const z = startZ + r * GRID_STEP_M;
    addPlane(roadMat, startX, z, totalW, ROAD_WIDTH_M, -0.05, 6);
  }

  // ── Vertical roads (GRID_COLS + 1 strips) ────────────────

  for (let c = 0; c <= GRID_COLS; c++) {
    const x = startX + c * GRID_STEP_M;
    addPlane(roadMat, x, startZ, ROAD_WIDTH_M, totalH, -0.05, 6);
  }

  // ── Per-plot: raised pavements + plot ground ──────────────

  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const px = startX + ROAD_WIDTH_M + c * GRID_STEP_M;
      const pz = startZ + ROAD_WIDTH_M + r * GRID_STEP_M;
      const pw = PAVEMENT_WIDTH_M;

      // Pavement: raised box sitting above road level
      addRaisedPlane(pavementMat, px, pz, PLOT_SIZE_M, PLOT_SIZE_M, -0.05, KERB_HEIGHT, 8);

      // Inner plot (grass) on top of pavement
      const innerSize = PLOT_SIZE_M - 2 * PAVEMENT_WIDTH_M;
      addRaisedPlane(plotMat, px + pw, pz + pw, innerSize, innerSize, -0.05 + KERB_HEIGHT, 0.05, 4);
    }
  }

  return ground;
}

/**
 * Dispose all ground plane geometries, materials, and cached textures.
 */
export function disposeGroundPlanes(group: THREE.Group) {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const mat = child.material as THREE.MeshPhysicalMaterial;
      if (mat.map) mat.map.dispose();
      if (mat.normalMap) mat.normalMap.dispose();
      mat.dispose();
    }
  });
}
