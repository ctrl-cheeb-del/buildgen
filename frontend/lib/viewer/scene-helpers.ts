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

/** Standard lighting for the standalone viewer */
export function createViewerLights(): THREE.Group {
  const group = new THREE.Group();

  const ambient = new THREE.AmbientLight(0xffffff, 0.8);
  group.add(ambient);

  const dir1 = new THREE.DirectionalLight(0xffffff, 1.2);
  dir1.position.set(100, 200, 100);
  group.add(dir1);

  const dir2 = new THREE.DirectionalLight(0xffffff, 0.5);
  dir2.position.set(-100, 150, -50);
  group.add(dir2);

  const dir3 = new THREE.DirectionalLight(0xffffff, 0.3);
  dir3.position.set(0, -100, 100);
  group.add(dir3);

  return group;
}
