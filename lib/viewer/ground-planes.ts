import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  GRID_COLS,
  GRID_ROWS,
  PLOT_SIZE_M,
  ROAD_WIDTH_M,
  PAVEMENT_WIDTH_M,
  GRID_STEP_M,
} from "@/lib/grid/grid-constants";
import { loadTileableTexture, loadTileableNormalMap } from "./texture-loader";

// Reusable matrix for baking transforms into geometries
const _mat4 = new THREE.Matrix4();

/**
 * Scale UV coordinates on a geometry to achieve tiling.
 * This replaces per-material texture repeat with per-geometry UV scaling,
 * allowing all geometries of the same type to share one material.
 */
function scaleUVs(geo: THREE.BufferGeometry, scaleU: number, scaleV: number) {
  const uv = geo.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * scaleU, uv.getY(i) * scaleV);
  }
}

/**
 * Create a flat plane geometry with baked position/rotation.
 * Returns geometry ready for merging (transforms applied to vertices).
 */
function makeFlatPlaneGeo(
  x: number,
  z: number,
  w: number,
  h: number,
  yOffset: number,
  baseRepeat: number
): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(w, h);
  _mat4.makeRotationX(-Math.PI / 2);
  _mat4.setPosition(x + w / 2, yOffset, z + h / 2);
  geo.applyMatrix4(_mat4);
  scaleUVs(geo, baseRepeat * (w / 30), baseRepeat * (h / 30));
  return geo;
}

/**
 * Create a raised box geometry with baked position.
 * Returns geometry ready for merging (transforms applied to vertices).
 */
function makeRaisedBoxGeo(
  x: number,
  z: number,
  w: number,
  h: number,
  yBase: number,
  thickness: number,
  baseRepeat: number
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, thickness, h);
  _mat4.identity();
  _mat4.setPosition(x + w / 2, yBase + thickness / 2, z + h / 2);
  geo.applyMatrix4(_mat4);
  scaleUVs(geo, baseRepeat * (w / 30), baseRepeat * (h / 30));
  return geo;
}

/**
 * Build all textured ground-plane meshes (roads, pavements, plots)
 * and return them as a single THREE.Group positioned at origin.
 *
 * Optimization: all roads merge into 1 mesh, all pavements into 1,
 * all grass into 1 — sharing 3 materials total instead of 180 clones.
 */
export function buildGroundPlanes(): THREE.Group {
  const ground = new THREE.Group();
  ground.name = "ground-planes";

  // Grid extents in meters (same math as grid-geometry.ts)
  const totalW = GRID_COLS * PLOT_SIZE_M + (GRID_COLS + 1) * ROAD_WIDTH_M;
  const totalH = GRID_ROWS * PLOT_SIZE_M + (GRID_ROWS + 1) * ROAD_WIDTH_M;
  const startX = -totalW / 2;
  const startZ = -totalH / 2;

  // ── Shared materials (UV scaling handles per-plane tiling) ──

  const asphaltTex = loadTileableTexture("/textures/asphalt.webp", 1);
  const asphaltNorm = loadTileableNormalMap("/textures/asphalt-normal.webp", 1);
  const roadMat = new THREE.MeshStandardMaterial({
    map: asphaltTex,
    normalMap: asphaltNorm,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 0.92,
    metalness: 0.0,
    side: THREE.FrontSide,
  });

  const pavementTex = loadTileableTexture("/textures/pavement-slabs.webp", 1);
  const pavementNorm = loadTileableNormalMap(
    "/textures/pavement-slabs-normal.webp",
    1
  );
  const pavementMat = new THREE.MeshStandardMaterial({
    map: pavementTex,
    normalMap: pavementNorm,
    normalScale: new THREE.Vector2(1.3, 1.3),
    roughness: 0.85,
    metalness: 0.0,
    side: THREE.FrontSide,
  });

  const grassTex = loadTileableTexture("/textures/grass.webp", 1);
  const grassNorm = loadTileableNormalMap("/textures/grass-normal.webp", 1);
  const plotMat = new THREE.MeshStandardMaterial({
    map: grassTex,
    normalMap: grassNorm,
    normalScale: new THREE.Vector2(0.25, 0.25),
    roughness: 0.95,
    metalness: 0.0,
    side: THREE.FrontSide,
  });

  // Kerb height: pavement sits this much above the road surface
  const KERB_HEIGHT = 0.15;

  // ── Collect geometries for batch merging ──

  const roadGeos: THREE.BufferGeometry[] = [];
  const pavementGeos: THREE.BufferGeometry[] = [];
  const grassGeos: THREE.BufferGeometry[] = [];

  // Horizontal roads (GRID_ROWS + 1 strips)
  for (let r = 0; r <= GRID_ROWS; r++) {
    const z = startZ + r * GRID_STEP_M;
    roadGeos.push(makeFlatPlaneGeo(startX, z, totalW, ROAD_WIDTH_M, -0.05, 6));
  }

  // Vertical roads (GRID_COLS + 1 strips)
  for (let c = 0; c <= GRID_COLS; c++) {
    const x = startX + c * GRID_STEP_M;
    roadGeos.push(makeFlatPlaneGeo(x, startZ, ROAD_WIDTH_M, totalH, -0.05, 6));
  }

  // Per-plot: raised pavements + plot ground
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const px = startX + ROAD_WIDTH_M + c * GRID_STEP_M;
      const pz = startZ + ROAD_WIDTH_M + r * GRID_STEP_M;

      // Pavement: raised box sitting above road level
      pavementGeos.push(
        makeRaisedBoxGeo(px, pz, PLOT_SIZE_M, PLOT_SIZE_M, -0.05, KERB_HEIGHT, 8)
      );

      // Inner plot (grass) on top of pavement
      const innerSize = PLOT_SIZE_M - 2 * PAVEMENT_WIDTH_M;
      grassGeos.push(
        makeRaisedBoxGeo(
          px + PAVEMENT_WIDTH_M,
          pz + PAVEMENT_WIDTH_M,
          innerSize,
          innerSize,
          -0.05 + KERB_HEIGHT,
          0.05,
          4
        )
      );
    }
  }

  // ── Merge into 3 draw calls ──

  const roadMerged = mergeGeometries(roadGeos, false);
  if (roadMerged) {
    const mesh = new THREE.Mesh(roadMerged, roadMat);
    mesh.receiveShadow = true;
    ground.add(mesh);
  }

  const pavementMerged = mergeGeometries(pavementGeos, false);
  if (pavementMerged) {
    const mesh = new THREE.Mesh(pavementMerged, pavementMat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    ground.add(mesh);
  }

  const grassMerged = mergeGeometries(grassGeos, false);
  if (grassMerged) {
    const mesh = new THREE.Mesh(grassMerged, plotMat);
    mesh.receiveShadow = true;
    ground.add(mesh);
  }

  // Dispose individual geometries (data is now in merged buffers)
  for (const g of roadGeos) g.dispose();
  for (const g of pavementGeos) g.dispose();
  for (const g of grassGeos) g.dispose();

  return ground;
}

/**
 * Dispose all ground plane geometries, materials, and cached textures.
 */
export function disposeGroundPlanes(group: THREE.Group) {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const mat = child.material as THREE.MeshStandardMaterial;
      if (mat.map) mat.map.dispose();
      if (mat.normalMap) mat.normalMap.dispose();
      mat.dispose();
    }
  });
}
