import * as THREE from "three";

const DOCK_Z = 680;
const DOCK_X = 0;
const PIER_LENGTH = 60;
const PIER_WIDTH = 20;

/** Create the procedural trade dock geometry */
export function createTradeDock(): THREE.Group {
  const group = new THREE.Group();
  group.name = "trade-dock";

  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b6914, roughness: 0.85 });
  const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x5c4010, roughness: 0.9 });
  const crateMats = [
    new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.7 }),
    new THREE.MeshStandardMaterial({ color: 0x2980b9, roughness: 0.7 }),
    new THREE.MeshStandardMaterial({ color: 0x27ae60, roughness: 0.7 }),
    new THREE.MeshStandardMaterial({ color: 0xf39c12, roughness: 0.7 }),
  ];

  // Pier platform — slopes from y=0 at city edge to y=-2 at water end
  const pierGeo = new THREE.BoxGeometry(PIER_WIDTH, 1.5, PIER_LENGTH);
  const pier = new THREE.Mesh(pierGeo, woodMat);
  pier.position.set(DOCK_X, -1, DOCK_Z + PIER_LENGTH / 2);
  pier.castShadow = true;
  pier.receiveShadow = true;
  group.add(pier);

  // Dock posts — cylindrical supports
  const postGeo = new THREE.CylinderGeometry(0.6, 0.6, 8, 8);
  const postPositions = [
    [-PIER_WIDTH / 2 + 1, DOCK_Z + 5],
    [PIER_WIDTH / 2 - 1, DOCK_Z + 5],
    [-PIER_WIDTH / 2 + 1, DOCK_Z + 20],
    [PIER_WIDTH / 2 - 1, DOCK_Z + 20],
    [-PIER_WIDTH / 2 + 1, DOCK_Z + 40],
    [PIER_WIDTH / 2 - 1, DOCK_Z + 40],
    [-PIER_WIDTH / 2 + 1, DOCK_Z + 55],
    [PIER_WIDTH / 2 - 1, DOCK_Z + 55],
  ];
  for (const [px, pz] of postPositions) {
    const post = new THREE.Mesh(postGeo, darkWoodMat);
    post.position.set(px, -5, pz);
    post.castShadow = true;
    group.add(post);
  }

  // Railing posts along edges
  const railGeo = new THREE.CylinderGeometry(0.3, 0.3, 3, 6);
  for (let i = 0; i < 6; i++) {
    const zOff = DOCK_Z + 5 + i * 10;
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(railGeo, darkWoodMat);
      rail.position.set(side * (PIER_WIDTH / 2 - 0.5), 0.5, zOff);
      rail.castShadow = true;
      group.add(rail);
    }
  }

  // Cargo crates on the pier
  const cratePositions = [
    { x: -4, z: DOCK_Z + 15, s: 2.5 },
    { x: -3, z: DOCK_Z + 18, s: 2 },
    { x: 5, z: DOCK_Z + 25, s: 3 },
    { x: 4, z: DOCK_Z + 28, s: 2 },
    { x: -5, z: DOCK_Z + 35, s: 2.5 },
    { x: 6, z: DOCK_Z + 40, s: 2 },
  ];
  for (let i = 0; i < cratePositions.length; i++) {
    const { x, z, s } = cratePositions[i];
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(s, s, s),
      crateMats[i % crateMats.length]
    );
    crate.position.set(DOCK_X + x, -0.25 + s / 2, z);
    crate.rotation.y = Math.random() * 0.3 - 0.15;
    crate.castShadow = true;
    crate.receiveShadow = true;
    group.add(crate);
  }

  // "TRADE PORT" sign — simple mesh with text-like appearance
  const signPostGeo = new THREE.CylinderGeometry(0.4, 0.4, 6, 6);
  const signPost = new THREE.Mesh(signPostGeo, darkWoodMat);
  signPost.position.set(DOCK_X - PIER_WIDTH / 2 - 2, 2, DOCK_Z + 2);
  signPost.castShadow = true;
  group.add(signPost);

  const signBoardGeo = new THREE.BoxGeometry(8, 2, 0.3);
  const signBoardMat = new THREE.MeshStandardMaterial({ color: 0x1a3a5c, roughness: 0.6 });
  const signBoard = new THREE.Mesh(signBoardGeo, signBoardMat);
  signBoard.position.set(DOCK_X - PIER_WIDTH / 2 + 2, 4.5, DOCK_Z + 2);
  signBoard.castShadow = true;
  group.add(signBoard);

  // Gold trim on sign
  const trimGeo = new THREE.BoxGeometry(8.4, 0.2, 0.35);
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.6 });
  const topTrim = new THREE.Mesh(trimGeo, goldMat);
  topTrim.position.set(DOCK_X - PIER_WIDTH / 2 + 2, 5.5, DOCK_Z + 2);
  group.add(topTrim);
  const bottomTrim = new THREE.Mesh(trimGeo, goldMat);
  bottomTrim.position.set(DOCK_X - PIER_WIDTH / 2 + 2, 3.5, DOCK_Z + 2);
  group.add(bottomTrim);

  return group;
}

/** Position where the trade ship docks */
export const SHIP_DOCK_POSITION = new THREE.Vector3(DOCK_X, -4.5, DOCK_Z + PIER_LENGTH + 20);

/** Position where the ship starts/ends (far away) */
export const SHIP_OFFSCREEN_POSITION = new THREE.Vector3(DOCK_X, -4.5, DOCK_Z + 250);
