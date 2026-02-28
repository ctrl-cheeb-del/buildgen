import * as THREE from "three";

const PLOT_SIZE = 30;

/** 30x30 footprint outline on the ground plane */
export function createFootprintOutline(): THREE.LineLoop {
  const half = PLOT_SIZE / 2;
  const points = [
    new THREE.Vector3(-half, 0.01, -half),
    new THREE.Vector3(half, 0.01, -half),
    new THREE.Vector3(half, 0.01, half),
    new THREE.Vector3(-half, 0.01, half),
  ];
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({ color: 0xff4444, linewidth: 2 });
  return new THREE.LineLoop(geo, mat);
}

/** Flat grid floor for spatial reference */
export function createGridFloor(): THREE.GridHelper {
  const grid = new THREE.GridHelper(100, 20, 0x444444, 0x333333);
  grid.position.y = 0;
  return grid;
}

/** XYZ axes helper */
export function createAxesHelper(): THREE.AxesHelper {
  return new THREE.AxesHelper(20);
}

/** Standard lighting for the standalone viewer — cinematic 3-point + hemisphere */
export function createViewerLights(): THREE.Group {
  const group = new THREE.Group();

  // Hemisphere light: warm sky blue from above, muted earth from below
  // Replaces flat white ambient for more natural fill
  const hemi = new THREE.HemisphereLight(0x87ceeb, 0x556b2f, 0.5);
  group.add(hemi);

  // Key light (sun) — warm white, casts shadows
  const sun = new THREE.DirectionalLight(0xfff4e6, 1.8);
  sun.position.set(60, 120, 80);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 300;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  // Target must be in the scene graph or shadows silently fail
  sun.target.position.set(0, 0, 0);
  group.add(sun);
  group.add(sun.target);

  // Fill light — cooler tone, opposite side, no shadows
  const fill = new THREE.DirectionalLight(0xc4d7ff, 0.4);
  fill.position.set(-80, 100, -40);
  group.add(fill);

  // Rim / back light — subtle warmth for silhouette pop
  const rim = new THREE.DirectionalLight(0xffeedd, 0.25);
  rim.position.set(0, 50, -100);
  group.add(rim);

  return group;
}
