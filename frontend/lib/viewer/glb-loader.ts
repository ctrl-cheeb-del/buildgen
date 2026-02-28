import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

const gltfLoader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath(
  "https://www.gstatic.com/draco/versioned/decoders/1.5.7/"
);
gltfLoader.setDRACOLoader(dracoLoader);

/**
 * Load a GLB file from a URL and return a normalized Three.js Group.
 * Scales and centers the model to fit within a reasonable bounding box.
 */
export async function loadGLB(url: string): Promise<THREE.Group> {
  const gltf = await gltfLoader.loadAsync(url);
  const group = new THREE.Group();
  group.add(gltf.scene);

  // Normalize scale: fit the model so it's ~100 units tall
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim > 0) {
    const targetHeight = 100;
    const scale = targetHeight / maxDim;
    gltf.scene.scale.multiplyScalar(scale);
  }

  // Recalculate bounds after scaling
  const newBox = new THREE.Box3().setFromObject(gltf.scene);
  const center = newBox.getCenter(new THREE.Vector3());

  // Center horizontally, place bottom at y=0
  gltf.scene.position.x -= center.x;
  gltf.scene.position.z -= center.z;
  gltf.scene.position.y -= newBox.min.y;

  // Apply a default material if the model has none
  gltf.scene.traverse((child) => {
    if (child instanceof THREE.Mesh && !child.material) {
      child.material = new THREE.MeshPhysicalMaterial({
        color: 0xcccccc,
        roughness: 0.7,
        metalness: 0.1,
      });
    }
  });

  return group;
}
