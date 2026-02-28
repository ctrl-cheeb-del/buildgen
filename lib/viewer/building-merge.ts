import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * Build a material key string from the visual properties that matter
 * for batching. Meshes with the same key can share a merged geometry.
 */
function materialKey(mat: THREE.MeshStandardMaterial): string {
  const c = mat.color;
  return [
    c.r.toFixed(4),
    c.g.toFixed(4),
    c.b.toFixed(4),
    mat.roughness.toFixed(3),
    mat.metalness.toFixed(3),
    mat.opacity.toFixed(3),
    mat.userData?.textureId ?? "",
  ].join("|");
}

interface MergeBucket {
  geometries: THREE.BufferGeometry[];
  material: THREE.MeshStandardMaterial;
  castShadow: boolean;
  receiveShadow: boolean;
  textureId: string | undefined;
}

/**
 * Merge child meshes of a building group by material key.
 * Reduces draw calls from ~5-30 per building down to ~1-5.
 *
 * Mutates `group` in place — removes original meshes and replaces
 * them with merged meshes. Skips InstancedMesh, SkinnedMesh, and
 * multi-material meshes.
 */
export function mergeBuildingGeometry(group: THREE.Group): void {
  const buckets = new Map<string, MergeBucket>();
  const meshesToRemove: THREE.Mesh[] = [];

  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (child instanceof THREE.InstancedMesh) return;
    if (child instanceof THREE.SkinnedMesh) return;

    const mat = child.material;
    // Skip multi-material meshes
    if (Array.isArray(mat)) return;
    if (!(mat instanceof THREE.MeshStandardMaterial)) return;

    const key = materialKey(mat);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        geometries: [],
        material: mat,
        castShadow: false,
        receiveShadow: false,
        textureId: child.userData?.textureId,
      };
      buckets.set(key, bucket);
    }

    // Clone geometry and bake world transform into vertices
    let geo = child.geometry.clone();
    // Ensure all geometries are non-indexed so mergeGeometries doesn't
    // choke on mixed indexed/non-indexed buffers in the same bucket.
    if (geo.index) {
      geo = geo.toNonIndexed();
    }
    child.updateWorldMatrix(true, false);
    geo.applyMatrix4(child.matrixWorld);
    bucket.geometries.push(geo);

    // Accumulate shadow flags
    if (child.castShadow) bucket.castShadow = true;
    if (child.receiveShadow) bucket.receiveShadow = true;

    // Track textureId consistency — clear if meshes disagree
    if (child.userData?.textureId !== bucket.textureId) {
      bucket.textureId = undefined;
    }

    meshesToRemove.push(child);
  });

  // Nothing to merge
  if (buckets.size === 0) return;

  // Remove original meshes
  for (const mesh of meshesToRemove) {
    mesh.removeFromParent();
    mesh.geometry.dispose();
  }

  // Reset group transform so merged world-space vertices are correct.
  // The group's own position/rotation/scale will be reapplied by the
  // container (world-store applies transforms on the parent container).
  const savedPos = group.position.clone();
  const savedRot = group.rotation.clone();
  const savedScale = group.scale.clone();

  // Create merged meshes.
  // Assign each material bucket a unique polygonOffset so coplanar faces
  // from different materials (e.g. wall + window at same position) resolve
  // deterministically instead of z-fighting.
  let offsetIndex = 0;
  for (const bucket of buckets.values()) {
    if (bucket.geometries.length === 0) continue;

    let mergedGeo: THREE.BufferGeometry | null;
    if (bucket.geometries.length === 1) {
      mergedGeo = bucket.geometries[0];
    } else {
      mergedGeo = mergeGeometries(bucket.geometries, false);
      // Dispose cloned source geometries
      for (const g of bucket.geometries) g.dispose();
    }

    if (!mergedGeo) continue;

    // Stagger depth per material so coplanar faces don't z-fight
    bucket.material.polygonOffset = true;
    bucket.material.polygonOffsetFactor = offsetIndex;
    bucket.material.polygonOffsetUnits = offsetIndex;
    offsetIndex++;

    const mesh = new THREE.Mesh(mergedGeo, bucket.material);
    mesh.castShadow = bucket.castShadow;
    mesh.receiveShadow = bucket.receiveShadow;

    if (bucket.textureId) {
      mesh.userData.textureId = bucket.textureId;
    }

    group.add(mesh);
  }

  // Restore group transform
  group.position.copy(savedPos);
  group.rotation.copy(savedRot);
  group.scale.copy(savedScale);
}
