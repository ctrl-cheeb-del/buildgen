import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const gltfLoader = new GLTFLoader();

let cachedBoat: THREE.Group | null = null;

/** Build a tiny stick figure sailor (~1.8m tall before boat scaling) */
function createStickFigure(): THREE.Group {
  const fig = new THREE.Group();
  fig.name = "stick-sailor";

  const mat = new THREE.MeshBasicMaterial({ color: 0x222222 });
  const skinMat = new THREE.MeshBasicMaterial({ color: 0xf0c8a0 });

  // Body (torso)
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 0.5, 6),
    mat
  );
  torso.position.y = 0.85;
  fig.add(torso);

  // Head
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 8, 6),
    skinMat
  );
  head.position.y = 1.25;
  fig.add(head);

  // Little sailor hat
  const hatBrim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 0.03, 8),
    new THREE.MeshBasicMaterial({ color: 0x1a3a5c })
  );
  hatBrim.position.y = 1.35;
  fig.add(hatBrim);
  const hatTop = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.12, 0.1, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  hatTop.position.y = 1.41;
  fig.add(hatTop);

  // Legs
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.5, 5),
      mat
    );
    leg.position.set(side * 0.08, 0.35, 0);
    fig.add(leg);
  }

  // Arms — one out to the side like waving, one on hip
  const armLeft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.4, 5),
    mat
  );
  armLeft.position.set(-0.22, 0.95, 0);
  armLeft.rotation.z = Math.PI / 4; // angled out
  fig.add(armLeft);

  const armRight = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.4, 5),
    mat
  );
  armRight.position.set(0.22, 1.05, 0);
  armRight.rotation.z = -Math.PI / 2.5; // waving up
  fig.add(armRight);

  // Hands (little spheres)
  const handLeft = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 5, 4),
    skinMat
  );
  handLeft.position.set(-0.36, 0.82, 0);
  fig.add(handLeft);

  const handRight = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 5, 4),
    skinMat
  );
  handRight.position.set(0.35, 1.2, 0);
  fig.add(handRight);

  return fig;
}

export async function loadBoatModel(): Promise<THREE.Group> {
  if (cachedBoat) return cachedBoat.clone();

  const gltf = await gltfLoader.loadAsync("/boat.gltf");
  const scene = gltf.scene;

  // Scale to ~20m long
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const maxHorizontal = Math.max(size.x, size.z);
  const targetLength = 20;
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

  // Keep original wood texture — just ensure shadow casting
  scene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  const group = new THREE.Group();
  group.add(scene);

  // Add stick figure sailor standing in the boat
  const sailor = createStickFigure();
  // Position near the back/center of the boat (standing on deck)
  const boatHeight = newBox.max.y - newBox.min.y;
  // Scale sailor big so they're clearly visible from chase cam
  const sailorScale = 5;
  sailor.scale.set(sailorScale, sailorScale, sailorScale);
  sailor.position.set(0, boatHeight * 0.55, 0);
  group.add(sailor);

  cachedBoat = group;
  return group.clone();
}
