import * as THREE from "three";
import {
  TOTAL_INTERSECTIONS,
  getTrafficLights,
  getLightPhase,
} from "./npc-traffic-lights";
import { ROAD_WIDTH_M } from "../grid/grid-constants";

/**
 * Traffic light visuals at each intersection.
 *
 * Model: dark metal pole (5m tall, 0.08m radius) with a rectangular signal
 * housing (0.5m wide × 1.2m tall × 0.35m deep) on top. The housing has a
 * dark body with an emissive signal face that changes between red/green.
 *
 * Placement: at each of the 4 corners of the intersection, on the pavement
 * curb (ROAD_WIDTH_M/2 from intersection center). Only 2 per intersection
 * are rendered (one for horizontal traffic, one for vertical) to keep
 * instance counts reasonable.
 */

const POLE_HEIGHT = 5;
const POLE_RADIUS = 0.08;
const HOUSING_W = 0.5; // width
const HOUSING_H = 1.2; // height
const HOUSING_D = 0.35; // depth
const SIGNAL_RADIUS = 0.15; // signal circle radius

// Corner offset: place on the pavement curb at the road edge
const CORNER_OFFSET = ROAD_WIDTH_M / 2 + 1; // 1m onto pavement from road edge

// Pre-allocated helpers
const _matrix = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _euler = new THREE.Euler();
const _green = new THREE.Color(0x22cc44);
const _red = new THREE.Color(0xcc2222);

/** Build traffic light geometry: pole + housing box */
let sharedGeo: THREE.BufferGeometry | null = null;

function getSignalGeometry(): THREE.BufferGeometry {
  if (sharedGeo) return sharedGeo;

  // Dark metal pole
  const pole = new THREE.CylinderGeometry(POLE_RADIUS, POLE_RADIUS, POLE_HEIGHT, 6);
  pole.translate(0, POLE_HEIGHT / 2, 0);

  // Signal housing box (dark body)
  const housing = new THREE.BoxGeometry(HOUSING_W, HOUSING_H, HOUSING_D);
  housing.translate(0, POLE_HEIGHT + HOUSING_H / 2, 0);

  // Top cap visor (small overhang above housing)
  const visor = new THREE.BoxGeometry(HOUSING_W + 0.15, 0.06, HOUSING_D + 0.2);
  visor.translate(0, POLE_HEIGHT + HOUSING_H + 0.03, 0);

  // Signal face — flat circle on front of housing
  // We use a small cylinder as the signal "lens"
  const signalTop = new THREE.CylinderGeometry(SIGNAL_RADIUS, SIGNAL_RADIUS, 0.05, 8);
  signalTop.rotateX(Math.PI / 2);
  signalTop.translate(0, POLE_HEIGHT + HOUSING_H * 0.75, HOUSING_D / 2 + 0.03);

  const signalBottom = new THREE.CylinderGeometry(SIGNAL_RADIUS, SIGNAL_RADIUS, 0.05, 8);
  signalBottom.rotateX(Math.PI / 2);
  signalBottom.translate(0, POLE_HEIGHT + HOUSING_H * 0.35, HOUSING_D / 2 + 0.03);

  // Merge all geometries
  const geos = [pole, housing, visor, signalTop, signalBottom];
  const allPositions: number[] = [];
  const allNormals: number[] = [];
  const allIndices: number[] = [];
  let vertexOffset = 0;

  for (const geo of geos) {
    const pos = geo.getAttribute("position");
    const norm = geo.getAttribute("normal");
    const idx = geo.getIndex()!;

    for (let i = 0; i < pos.count * 3; i++) {
      allPositions.push((pos.array as Float32Array)[i]);
      allNormals.push((norm.array as Float32Array)[i]);
    }
    for (let i = 0; i < idx.count; i++) {
      allIndices.push((idx.array as Uint16Array)[i] + vertexOffset);
    }
    vertexOffset += pos.count;
    geo.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(allPositions), 3)
  );
  merged.setAttribute(
    "normal",
    new THREE.BufferAttribute(new Float32Array(allNormals), 3)
  );
  merged.setIndex(
    new THREE.BufferAttribute(new Uint16Array(allIndices), 1)
  );

  sharedGeo = merged;
  return merged;
}

export interface TrafficLightMeshes {
  group: THREE.Group;
  horizontalMesh: THREE.InstancedMesh;
  verticalMesh: THREE.InstancedMesh;
  material: THREE.MeshStandardMaterial;
}

/** Create the traffic light instanced meshes. */
export function createTrafficLightMeshes(): TrafficLightMeshes {
  const geo = getSignalGeometry();

  // Dark metal material — instance color only tints the emissive signal face,
  // but since InstancedMesh applies color as a multiply we use a neutral base
  // and rely on setColorAt to set the signal color.
  const material = new THREE.MeshStandardMaterial({
    color: 0x444444,
    roughness: 0.7,
    metalness: 0.5,
  });

  const lights = getTrafficLights();
  const count = TOTAL_INTERSECTIONS;

  const horizontalMesh = new THREE.InstancedMesh(geo, material, count);
  horizontalMesh.count = count;
  horizontalMesh.frustumCulled = false;
  horizontalMesh.castShadow = false;
  horizontalMesh.name = "traffic-lights-horizontal";

  const verticalMesh = new THREE.InstancedMesh(geo, material, count);
  verticalMesh.count = count;
  verticalMesh.frustumCulled = false;
  verticalMesh.castShadow = false;
  verticalMesh.name = "traffic-lights-vertical";

  for (let i = 0; i < count; i++) {
    const light = lights[i];

    // Horizontal signal: positioned at -X, +Z corner of intersection
    // (faces +X direction, visible to traffic coming from -X / horizontal direction)
    _pos.set(light.x - CORNER_OFFSET, 0, light.z + CORNER_OFFSET);
    _euler.set(0, Math.PI / 2, 0); // face along +X (horizontal traffic)
    _quat.setFromEuler(_euler);
    _matrix.compose(_pos, _quat, _scale);
    horizontalMesh.setMatrixAt(i, _matrix);

    // Vertical signal: positioned at +X, -Z corner of intersection
    // (faces +Z direction, visible to traffic coming from -Z / vertical direction)
    _pos.set(light.x + CORNER_OFFSET, 0, light.z - CORNER_OFFSET);
    _euler.set(0, 0, 0); // face along +Z (vertical traffic)
    _quat.setFromEuler(_euler);
    _matrix.compose(_pos, _quat, _scale);
    verticalMesh.setMatrixAt(i, _matrix);
  }

  horizontalMesh.instanceMatrix.needsUpdate = true;
  verticalMesh.instanceMatrix.needsUpdate = true;

  // Initialize colors
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    color.copy(_green);
    horizontalMesh.setColorAt(i, color);
    color.copy(_red);
    verticalMesh.setColorAt(i, color);
  }
  horizontalMesh.instanceColor!.needsUpdate = true;
  verticalMesh.instanceColor!.needsUpdate = true;

  const group = new THREE.Group();
  group.name = "traffic-lights";
  group.add(horizontalMesh);
  group.add(verticalMesh);

  return { group, horizontalMesh, verticalMesh, material };
}

/** Update traffic light colors based on current world time. */
export function updateTrafficLightColors(
  horizontalMesh: THREE.InstancedMesh,
  verticalMesh: THREE.InstancedMesh,
  worldTime: number
): void {
  const count = TOTAL_INTERSECTIONS;

  for (let i = 0; i < count; i++) {
    const phase = getLightPhase(i, worldTime);

    if (phase === 0) {
      horizontalMesh.setColorAt(i, _green);
      verticalMesh.setColorAt(i, _red);
    } else {
      horizontalMesh.setColorAt(i, _red);
      verticalMesh.setColorAt(i, _green);
    }
  }

  horizontalMesh.instanceColor!.needsUpdate = true;
  verticalMesh.instanceColor!.needsUpdate = true;
}
