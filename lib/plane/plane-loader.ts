import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const gltfLoader = new GLTFLoader();

let cachedPlane: THREE.Group | null = null;

const FUSELAGE_COLOR = 0xe8e8e8; // light silver-white
const ACCENT_COLOR = 0x1a5276; // airline blue

const fuselageMaterial = new THREE.MeshPhysicalMaterial({
  color: FUSELAGE_COLOR,
  metalness: 0.6,
  roughness: 0.3,
  clearcoat: 0.5,
  clearcoatRoughness: 0.2,
  side: THREE.DoubleSide,
});

const accentMaterial = new THREE.MeshPhysicalMaterial({
  color: ACCENT_COLOR,
  metalness: 0.4,
  roughness: 0.4,
  side: THREE.DoubleSide,
});

function isDarkPart(mat: THREE.Material): boolean {
  if (!("color" in mat)) return false;
  const m = mat as THREE.MeshStandardMaterial;
  const hsl = { h: 0, s: 0, l: 0 };
  m.color.getHSL(hsl);
  return hsl.l < 0.3;
}

export async function loadPlaneModel(): Promise<THREE.Group> {
  if (cachedPlane) return cachedPlane.clone();

  const gltf = await gltfLoader.loadAsync("/plane.gltf");
  const scene = gltf.scene;

  // Scale to ~25m long (medium haul plane)
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const targetLength = 25;
  if (maxDim > 0) {
    const s = targetLength / maxDim;
    scene.scale.multiplyScalar(s);
  }

  // Rotate model so nose faces -Z (forward in our coordinate system)
  scene.rotateY(Math.PI / 2);

  // Recalculate bounds and center
  const newBox = new THREE.Box3().setFromObject(scene);
  const center = newBox.getCenter(new THREE.Vector3());
  scene.position.x -= center.x;
  scene.position.z -= center.z;
  scene.position.y -= newBox.min.y; // sit on ground

  // Override materials — silver fuselage + blue accents
  scene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const mats = Array.isArray(child.material)
        ? child.material
        : [child.material];
      for (let i = 0; i < mats.length; i++) {
        const mat = mats[i];
        if (!mat) continue;
        // Strip textures
        if ("map" in mat) (mat as any).map = null;
        if ("normalMap" in mat) (mat as any).normalMap = null;
        if ("emissiveMap" in mat) (mat as any).emissiveMap = null;
        if ("roughnessMap" in mat) (mat as any).roughnessMap = null;
        if ("metalnessMap" in mat) (mat as any).metalnessMap = null;
        if ("aoMap" in mat) (mat as any).aoMap = null;
        mat.needsUpdate = true;

        const replaceMat = isDarkPart(mat) ? accentMaterial : fuselageMaterial;
        if (Array.isArray(child.material)) {
          child.material[i] = replaceMat;
        } else {
          child.material = replaceMat;
        }
      }
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  const group = new THREE.Group();
  group.add(scene);
  cachedPlane = group;
  return group.clone();
}
