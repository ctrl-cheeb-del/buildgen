import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

const gltfLoader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath(
  "https://www.gstatic.com/draco/versioned/decoders/1.5.7/"
);
gltfLoader.setDRACOLoader(dracoLoader);

let cachedCar: THREE.Group | null = null;

const PETROL_BLUE = 0x105983;

const bodyMaterial = new THREE.MeshPhysicalMaterial({
  color: PETROL_BLUE,
  metalness: 0.85,
  roughness: 0.15,
  clearcoat: 1.0,
  clearcoatRoughness: 0.1,
  side: THREE.DoubleSide,
});

function isBodyMaterial(mat: THREE.Material): boolean {
  if (!("color" in mat)) return false;
  const m = mat as THREE.MeshStandardMaterial;
  // Skip very dark materials (tires, trim) and transparent materials (glass)
  if (m.transparent || m.opacity < 0.9) return false;
  const hsl = { h: 0, s: 0, l: 0 };
  m.color.getHSL(hsl);
  // Skip very dark (< 0.1 lightness) — likely tires/trim
  // Skip very light (> 0.9 lightness) — likely headlights
  return hsl.l > 0.1 && hsl.l < 0.9;
}

export async function loadCarModel(): Promise<THREE.Group> {
  if (cachedCar) return cachedCar.clone();

  const gltf = await gltfLoader.loadAsync("/car.glb");
  const scene = gltf.scene;

  // Compute current bounds and scale to ~5m long
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const maxHorizontal = Math.max(size.x, size.z);
  const targetLength = 16;
  if (maxHorizontal > 0) {
    const s = targetLength / maxHorizontal;
    scene.scale.multiplyScalar(s);
  }

  // Recalculate bounds and center
  const newBox = new THREE.Box3().setFromObject(scene);
  const center = newBox.getCenter(new THREE.Vector3());
  scene.position.x -= center.x;
  scene.position.z -= center.z;
  scene.position.y -= newBox.min.y;

  // Override body materials with petrol blue metallic
  scene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const mats = Array.isArray(child.material)
        ? child.material
        : [child.material];
      for (let i = 0; i < mats.length; i++) {
        if (mats[i] && isBodyMaterial(mats[i])) {
          if (Array.isArray(child.material)) {
            child.material[i] = bodyMaterial;
          } else {
            child.material = bodyMaterial;
          }
        }
      }
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  const group = new THREE.Group();
  group.add(scene);
  cachedCar = group;
  return group.clone();
}
