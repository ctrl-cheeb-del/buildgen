import * as THREE from "three";

const PED_COLORS = [
  0xcc3333, // red jacket
  0x3344aa, // blue jacket
  0x33aa55, // green jacket
  0xcc8833, // orange jacket
  0x8833aa, // purple jacket
  0x333333, // dark jacket
  0xaa6633, // brown jacket
  0x336688, // teal jacket
];

const MAX_PEDESTRIANS = 40;

/** Shared pedestrian geometry — capsule figure (~1.7m tall) */
let sharedGeometry: THREE.BufferGeometry | null = null;

function getPedestrianGeometry(): THREE.BufferGeometry {
  if (sharedGeometry) return sharedGeometry;

  // Body cylinder (6 radial segments for low poly)
  const body = new THREE.CylinderGeometry(0.25, 0.25, 1.2, 6);
  body.translate(0, 0.6, 0);

  // Head sphere (6x4 segments)
  const head = new THREE.SphereGeometry(0.2, 6, 4);
  head.translate(0, 1.4, 0);

  // Merge
  const bodyPos = body.getAttribute("position");
  const headPos = head.getAttribute("position");
  const bodyNorm = body.getAttribute("normal");
  const headNorm = head.getAttribute("normal");
  const bodyIdx = body.getIndex()!;
  const headIdx = head.getIndex()!;

  const totalVerts = bodyPos.count + headPos.count;
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);

  positions.set(new Float32Array(bodyPos.array), 0);
  positions.set(new Float32Array(headPos.array), bodyPos.count * 3);
  normals.set(new Float32Array(bodyNorm.array), 0);
  normals.set(new Float32Array(headNorm.array), bodyNorm.count * 3);

  const totalIndices = bodyIdx.count + headIdx.count;
  const indices = new Uint16Array(totalIndices);
  indices.set(new Uint16Array(bodyIdx.array), 0);
  const headIndices = new Uint16Array(headIdx.array);
  for (let i = 0; i < headIndices.length; i++) {
    headIndices[i] += bodyPos.count;
  }
  indices.set(headIndices, bodyIdx.count);

  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));

  body.dispose();
  head.dispose();

  sharedGeometry = merged;
  return merged;
}

export function createPedestrianInstances(): {
  mesh: THREE.InstancedMesh;
  materials: THREE.MeshStandardMaterial[];
} {
  const geo = getPedestrianGeometry();

  const material = new THREE.MeshStandardMaterial({
    roughness: 0.8,
    metalness: 0.1,
  });

  const mesh = new THREE.InstancedMesh(geo, material, MAX_PEDESTRIANS);
  mesh.count = 0;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;

  const color = new THREE.Color();
  for (let i = 0; i < MAX_PEDESTRIANS; i++) {
    color.setHex(PED_COLORS[i % PED_COLORS.length]);
    mesh.setColorAt(i, color);
  }
  mesh.instanceColor!.needsUpdate = true;

  return { mesh, materials: [material] };
}

export { MAX_PEDESTRIANS, PED_COLORS };
