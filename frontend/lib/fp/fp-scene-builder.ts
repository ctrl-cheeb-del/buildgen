import * as THREE from "three";
import { buildGroundPlanes } from "../viewer/ground-planes";
import { createEnvironmentMap } from "../viewer/environment";
import { loadProceduralGeometry } from "../viewer/procedural-loader";
import { applyBuildingTextures } from "../viewer/building-textures";
import { plotCenterMeters } from "../grid/grid-geometry";
import { gridIndexToColRow } from "../grid/grid-geometry";
import {
  GRID_COLS,
  GRID_ROWS,
  PLOT_SIZE_M,
  ROAD_WIDTH_M,
  GRID_STEP_M,
} from "../grid/grid-constants";

export interface BuildingData {
  _id: string;
  plotIndex: number;
  proceduralCode: string;
  position?: { x: number; y: number; z: number } | null;
  rotation?: { x: number; y: number; z: number } | null;
  scale?: number | null;
}

export interface FPSceneResult {
  scene: THREE.Scene;
  colliders: THREE.Box3[];
  bounds: THREE.Box3;
  dispose: () => void;
}

export function buildFPScene(
  renderer: THREE.WebGLRenderer,
  buildings: BuildingData[]
): FPSceneResult {
  const scene = new THREE.Scene();
  const colliders: THREE.Box3[] = [];

  // Sky + fog
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.FogExp2(0xc8ddf0, 0.0015);

  // Environment map for PBR
  const envMap = createEnvironmentMap(renderer);
  scene.environment = envMap;

  // Lighting — same as mapbox-layer.ts
  const hemi = new THREE.HemisphereLight(0x87ceeb, 0x556b2f, 0.6);
  scene.add(hemi);

  // Key light (sun) with shadows
  const sun = new THREE.DirectionalLight(0xfff4e6, 1.6);
  sun.position.set(500, 800, 400);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.left = -800;
  sun.shadow.camera.right = 800;
  sun.shadow.camera.top = 800;
  sun.shadow.camera.bottom = -800;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 1800;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);

  // Fill light
  const fill = new THREE.DirectionalLight(0xc4d7ff, 0.4);
  fill.position.set(-100, 150, -50);
  scene.add(fill);

  // Rim light
  const rim = new THREE.DirectionalLight(0xffeedd, 0.25);
  rim.position.set(0, -100, 100);
  scene.add(rim);

  // Ground planes (roads, pavements, grass)
  const ground = buildGroundPlanes();
  scene.add(ground);

  // Buildings
  for (const b of buildings) {
    try {
      const group = loadProceduralGeometry(b.proceduralCode);

      // Post-process materials: set DoubleSide for FP scene
      // (procedural-loader sets FrontSide for Mapbox's CW winding)
      group.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          const mats = Array.isArray(child.material)
            ? child.material
            : [child.material];
          for (const mat of mats) {
            mat.side = THREE.DoubleSide;
          }
        }
      });

      // Apply textures (async — pops in)
      applyBuildingTextures(group);

      // Position building at plot center
      const { col, row } = gridIndexToColRow(b.plotIndex);
      const [cx, cz] = plotCenterMeters(col, row);

      const wrapper = new THREE.Group();
      wrapper.add(group);
      wrapper.position.set(cx, 0, cz);

      // Apply persisted offset/rotation/scale
      if (b.position) {
        wrapper.position.x += b.position.x;
        wrapper.position.y += b.position.y;
        wrapper.position.z += b.position.z;
      }
      if (b.rotation) {
        wrapper.rotation.set(b.rotation.x, b.rotation.y, b.rotation.z);
      }
      if (b.scale && b.scale !== 1) {
        wrapper.scale.setScalar(b.scale);
      }

      scene.add(wrapper);

      // Compute AABB for collision
      const box = new THREE.Box3().setFromObject(wrapper);
      if (!box.isEmpty()) {
        colliders.push(box);
      }
    } catch (err) {
      console.error(`[FPScene] Failed to load building ${b._id}:`, err);
    }
  }

  // Grid bounds for clamping
  const totalW = GRID_COLS * PLOT_SIZE_M + (GRID_COLS + 1) * ROAD_WIDTH_M;
  const totalH = GRID_ROWS * PLOT_SIZE_M + (GRID_ROWS + 1) * ROAD_WIDTH_M;
  const bounds = new THREE.Box3(
    new THREE.Vector3(-totalW / 2, 0, -totalH / 2),
    new THREE.Vector3(totalW / 2, 500, totalH / 2)
  );

  const dispose = () => {
    envMap.dispose();
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const mats = Array.isArray(child.material)
          ? child.material
          : [child.material];
        for (const mat of mats) {
          if (mat.map) mat.map.dispose();
          if ((mat as THREE.MeshStandardMaterial).normalMap)
            (mat as THREE.MeshStandardMaterial).normalMap?.dispose();
          mat.dispose();
        }
      }
    });
  };

  return { scene, colliders, bounds, dispose };
}

/** Spawn at grid center on a road intersection */
export function getSpawnPosition(): THREE.Vector3 {
  const totalW = GRID_COLS * PLOT_SIZE_M + (GRID_COLS + 1) * ROAD_WIDTH_M;
  const totalH = GRID_ROWS * PLOT_SIZE_M + (GRID_ROWS + 1) * ROAD_WIDTH_M;
  const startX = -totalW / 2;
  const startZ = -totalH / 2;

  // Center road intersection
  const centerCol = Math.floor(GRID_COLS / 2);
  const centerRow = Math.floor(GRID_ROWS / 2);
  const x = startX + centerCol * GRID_STEP_M + ROAD_WIDTH_M / 2;
  const z = startZ + centerRow * GRID_STEP_M + ROAD_WIDTH_M / 2;

  return new THREE.Vector3(x, 1.7, z);
}
