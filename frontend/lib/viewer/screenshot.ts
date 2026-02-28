import * as THREE from "three";

export interface MultiAngleScreenshots {
  front: string;
  right: string;
  back: string;
  left: string;
}

/**
 * Capture screenshots from 4 cardinal directions.
 * Camera orbits at the given distance and height, looking at the target.
 */
export function captureMultiAngle(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  distance: number,
  height: number
): MultiAngleScreenshots {
  // Save original camera state
  const origPos = camera.position.clone();
  const origTarget = camera.quaternion.clone();

  const views: { key: keyof MultiAngleScreenshots; angle: number }[] = [
    { key: "front", angle: 0 },
    { key: "right", angle: Math.PI / 2 },
    { key: "back", angle: Math.PI },
    { key: "left", angle: (3 * Math.PI) / 2 },
  ];

  const result: Partial<MultiAngleScreenshots> = {};

  for (const { key, angle } of views) {
    camera.position.set(
      target.x + Math.sin(angle) * distance,
      target.y + height,
      target.z + Math.cos(angle) * distance
    );
    camera.lookAt(target);
    camera.updateProjectionMatrix();

    renderer.render(scene, camera);
    result[key] = renderer.domElement.toDataURL("image/png");
  }

  // Restore camera
  camera.position.copy(origPos);
  camera.quaternion.copy(origTarget);
  camera.updateProjectionMatrix();

  return result as MultiAngleScreenshots;
}
