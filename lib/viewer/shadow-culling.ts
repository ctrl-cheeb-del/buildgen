import * as THREE from "three";

const _pos = new THREE.Vector3();

/**
 * Disable shadow casting on buildings far from the camera.
 * Beyond 500m XZ distance: disable castShadow on all child meshes.
 * Under 450m (hysteresis band): re-enable shadows.
 *
 * Returns true if any container's shadow state changed (caller should repaint).
 */
export function updateShadowCulling(
  containers: Map<string, THREE.Group>,
  camera: THREE.Camera
): boolean {
  const camX = camera.position.x;
  const camZ = camera.position.z;
  let changed = false;

  for (const container of containers.values()) {
    if (!container.visible) continue;

    container.getWorldPosition(_pos);
    const dx = _pos.x - camX;
    const dz = _pos.z - camZ;
    const distSq = dx * dx + dz * dz;

    const wasCulled = container.userData._shadowCulled === true;

    if (distSq > 500 * 500 && !wasCulled) {
      container.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = false;
        }
      });
      container.userData._shadowCulled = true;
      changed = true;
    } else if (distSq < 450 * 450 && wasCulled) {
      container.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
        }
      });
      container.userData._shadowCulled = false;
      changed = true;
    }
  }

  return changed;
}
