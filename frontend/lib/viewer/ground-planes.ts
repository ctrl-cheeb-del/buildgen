import * as THREE from "three";
import {
  GRID_COLS,
  GRID_ROWS,
  PLOT_SIZE_M,
  ROAD_WIDTH_M,
  PAVEMENT_WIDTH_M,
  GRID_STEP_M,
} from "@/lib/grid/grid-constants";
import { loadTileableTexture } from "./texture-loader";

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

  // polygonOffset pushes fragments back in depth buffer so overlapping
  // coplanar surfaces resolve cleanly at any zoom — eliminates z-fighting
  // that Y offsets alone can't fix at far distances.
  // Higher factor/units = pushed further back (rendered behind).

  const asphaltTex = loadTileableTexture("/textures/asphalt.webp", 6);
  const roadMat = new THREE.MeshPhysicalMaterial({
    map: asphaltTex,
    roughness: 0.92,
    metalness: 0.0,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 4,
    polygonOffsetUnits: 4,
  });

  const pavementTex = loadTileableTexture("/textures/pavement-slabs.webp", 8);
  const pavementMat = new THREE.MeshPhysicalMaterial({
    map: pavementTex,
    roughness: 0.85,
    metalness: 0.0,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 2,
  });

  const grassTex = loadTileableTexture("/textures/grass.webp", 4);
  const plotMat = new THREE.MeshPhysicalMaterial({
    map: grassTex,
    roughness: 0.95,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  // Helper: create a flat plane at y ≈ 0 (slight offset to avoid z-fighting).
  // baseRepeat is "tiles per 30m", so we scale proportionally to actual plane size.
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

    // Clone material + texture so each plane gets its own repeat settings
    const clonedMat = mat.clone();
    if (mat.map) {
      clonedMat.map = mat.map.clone();
      clonedMat.map.wrapS = THREE.RepeatWrapping;
      clonedMat.map.wrapT = THREE.RepeatWrapping;
      clonedMat.map.repeat.set(
        baseRepeat * (w / 30),
        baseRepeat * (h / 30)
      );
      clonedMat.map.needsUpdate = true;
    }

    const mesh = new THREE.Mesh(geo, clonedMat);
    mesh.receiveShadow = true;
    // Plane is XY by default — rotate to XZ (flat on ground)
    mesh.rotation.x = -Math.PI / 2;
    // Position: center of the rect
    mesh.position.set(x + w / 2, yOffset, z + h / 2);
    ground.add(mesh);
  }

  // ── Horizontal roads (GRID_ROWS + 1 strips) ──────────────

  for (let r = 0; r <= GRID_ROWS; r++) {
    const z = startZ + r * GRID_STEP_M;
    addPlane(roadMat, startX, z, totalW, ROAD_WIDTH_M, -0.3, 6);
  }

  // ── Vertical roads (GRID_COLS + 1 strips) ────────────────

  for (let c = 0; c <= GRID_COLS; c++) {
    const x = startX + c * GRID_STEP_M;
    addPlane(roadMat, x, startZ, ROAD_WIDTH_M, totalH, -0.3, 6);
  }

  // ── Per-plot: pavements + plot ground ─────────────────────

  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const px = startX + ROAD_WIDTH_M + c * GRID_STEP_M;
      const pz = startZ + ROAD_WIDTH_M + r * GRID_STEP_M;
      const pw = PAVEMENT_WIDTH_M;

      // Full plot-size pavement underlay
      addPlane(pavementMat, px, pz, PLOT_SIZE_M, PLOT_SIZE_M, -0.15, 8);

      // Inner plot (grass) on top of pavement
      const innerSize = PLOT_SIZE_M - 2 * PAVEMENT_WIDTH_M;
      addPlane(plotMat, px + pw, pz + pw, innerSize, innerSize, 0, 4);
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
      mat.dispose();
    }
  });
}
