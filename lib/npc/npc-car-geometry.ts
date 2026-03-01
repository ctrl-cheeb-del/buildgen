import * as THREE from "three";

const CAR_COLORS = [
  0xcc2222, // red
  0x2244aa, // blue
  0x228833, // green
  0xccaa22, // yellow
  0x8833aa, // purple
  0x1a1a44, // navy
  0xdddddd, // white
  0x999999, // silver
];

const MAX_CARS = 80;

/** Shared car geometry — boxy sedan (~6m × 2.2m × 1.7m) */
let sharedGeometry: THREE.BufferGeometry | null = null;

function getCarGeometry(): THREE.BufferGeometry {
  if (sharedGeometry) return sharedGeometry;

  // Lower body
  const body = new THREE.BoxGeometry(6, 1.0, 2.2);
  body.translate(0, 0.5, 0);

  // Cabin (slightly narrower, offset up)
  const cabin = new THREE.BoxGeometry(3.2, 0.7, 2.0);
  cabin.translate(-0.3, 1.35, 0);

  // Merge into single geometry
  const merged = new THREE.BufferGeometry();
  const bodyPos = body.getAttribute("position");
  const cabinPos = cabin.getAttribute("position");
  const bodyNorm = body.getAttribute("normal");
  const cabinNorm = cabin.getAttribute("normal");
  const bodyIdx = body.getIndex()!;
  const cabinIdx = cabin.getIndex()!;

  const totalVerts = bodyPos.count + cabinPos.count;
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);

  positions.set(new Float32Array(bodyPos.array), 0);
  positions.set(new Float32Array(cabinPos.array), bodyPos.count * 3);
  normals.set(new Float32Array(bodyNorm.array), 0);
  normals.set(new Float32Array(cabinNorm.array), bodyNorm.count * 3);

  const totalIndices = bodyIdx.count + cabinIdx.count;
  const indices = new Uint16Array(totalIndices);
  indices.set(new Uint16Array(bodyIdx.array), 0);
  const cabinIndices = new Uint16Array(cabinIdx.array);
  for (let i = 0; i < cabinIndices.length; i++) {
    cabinIndices[i] += bodyPos.count;
  }
  indices.set(cabinIndices, bodyIdx.count);

  merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));

  body.dispose();
  cabin.dispose();

  sharedGeometry = merged;
  return merged;
}

export function createCarInstances(): {
  mesh: THREE.InstancedMesh;
  materials: THREE.MeshStandardMaterial[];
} {
  const geo = getCarGeometry();

  // Use a single material — we set color per instance
  const material = new THREE.MeshStandardMaterial({
    roughness: 0.6,
    metalness: 0.3,
  });

  const mesh = new THREE.InstancedMesh(geo, material, MAX_CARS);
  mesh.count = 0; // start with none visible
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false; // instances manage their own visibility

  // Set instance colors
  const color = new THREE.Color();
  for (let i = 0; i < MAX_CARS; i++) {
    color.setHex(CAR_COLORS[i % CAR_COLORS.length]);
    mesh.setColorAt(i, color);
  }
  mesh.instanceColor!.needsUpdate = true;

  return { mesh, materials: [material] };
}

export { MAX_CARS, CAR_COLORS };
