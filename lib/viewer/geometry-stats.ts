import * as THREE from "three";

export interface GeometryStats {
  dimensions: { x: number; y: number; z: number };
  center: { x: number; y: number; z: number };
  minY: number;
  maxY: number;
  vertexCount: number;
  meshCount: number;
  isGrounded: boolean; // minY ~= 0
  fitsFootprint: boolean; // x and z within 30m
  footprint: { x: number; z: number }; // actual footprint size
}

const PLOT_SIZE = 30;
const GROUNDING_TOLERANCE = 1; // 1 unit tolerance

export function computeGeometryStats(group: THREE.Group): GeometryStats {
  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  let vertexCount = 0;
  let meshCount = 0;

  group.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      meshCount++;
      const pos = child.geometry.getAttribute("position");
      if (pos) vertexCount += pos.count;
    }
  });

  const minY = box.min.y;
  const isGrounded = Math.abs(minY) <= GROUNDING_TOLERANCE;
  const fitsFootprint = size.x <= PLOT_SIZE && size.z <= PLOT_SIZE;

  return {
    dimensions: { x: round(size.x), y: round(size.y), z: round(size.z) },
    center: { x: round(center.x), y: round(center.y), z: round(center.z) },
    minY: round(minY),
    maxY: round(box.max.y),
    vertexCount,
    meshCount,
    isGrounded,
    fitsFootprint,
    footprint: { x: round(size.x), z: round(size.z) },
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
