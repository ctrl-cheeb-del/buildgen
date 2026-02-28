import * as THREE from "three";

const _pos = new THREE.Vector3();

/**
 * Hide building containers that are far from the camera.
 * Beyond 2000m XZ distance: set container.visible = false.
 * Under 1900m (hysteresis band): restore visibility.
 *
 * Only toggles containers not explicitly hidden by app logic
 * (checks userData._visCulled tag to avoid overriding app state).
 *
 * Returns true if any container's visibility changed (caller should repaint).
 */
export function updateVisibilityCulling(
  containers: Map<string, THREE.Group>,
  camera: THREE.Camera
): boolean {
  const camX = camera.position.x;
  const camZ = camera.position.z;
  let changed = false;

  for (const container of containers.values()) {
    container.getWorldPosition(_pos);
    const dx = _pos.x - camX;
    const dz = _pos.z - camZ;
    const distSq = dx * dx + dz * dz;

    if (distSq > 2000 * 2000) {
      if (container.visible) {
        container.visible = false;
        container.userData._visCulled = true;
        changed = true;
      }
    } else if (distSq < 1900 * 1900) {
      if (container.userData._visCulled) {
        container.visible = true;
        container.userData._visCulled = false;
        changed = true;
      }
    }
  }

  return changed;
}
