import * as THREE from "three";

/**
 * Compute bounding box size and weighted average color of a building group.
 */
function computeBuildingStats(group: THREE.Group): {
  size: THREE.Vector3;
  center: THREE.Vector3;
  color: THREE.Color;
} {
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  // Weighted average color by geometry vertex count
  const color = new THREE.Color(0, 0, 0);
  let totalWeight = 0;

  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const mat = child.material;
    if (Array.isArray(mat) || !(mat instanceof THREE.MeshStandardMaterial)) return;

    const weight = child.geometry.getAttribute("position")?.count ?? 1;
    color.r += mat.color.r * weight;
    color.g += mat.color.g * weight;
    color.b += mat.color.b * weight;
    totalWeight += weight;
  });

  if (totalWeight > 0) {
    color.r /= totalWeight;
    color.g /= totalWeight;
    color.b /= totalWeight;
  } else {
    color.set(0x888888);
  }

  return { size, center, color };
}

/**
 * Wrap a building model group in a THREE.LOD with two levels:
 *  - Level 0 (0m): full geometry
 *  - Level 1 (800m): single box mesh matching bounding box + average color
 *
 * No empty level — visibility culling already handles far buildings.
 * Buildings always remain visible as at least a colored block.
 *
 * LOD auto-updates during renderer.render().
 * Raycasting hits the active level — parent-walk still reaches the
 * building-{id} container since LOD sits inside it.
 */
export function createBuildingLOD(modelGroup: THREE.Group): THREE.LOD {
  const lod = new THREE.LOD();

  // Level 0: full detail
  lod.addLevel(modelGroup, 0);

  // Level 1: simplified box proxy (far away)
  const { size, center, color } = computeBuildingStats(modelGroup);

  if (size.x > 0 && size.y > 0 && size.z > 0) {
    const boxGeo = new THREE.BoxGeometry(size.x, size.y, size.z);
    const boxMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.7,
      metalness: 0.1,
    });
    const boxMesh = new THREE.Mesh(boxGeo, boxMat);
    boxMesh.position.copy(center);
    boxMesh.castShadow = true;
    boxMesh.receiveShadow = true;

    const level1 = new THREE.Group();
    level1.add(boxMesh);
    lod.addLevel(level1, 800);
  }

  return lod;
}
