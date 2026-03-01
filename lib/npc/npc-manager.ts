import * as THREE from "three";
import type {
  NPCCar,
  NPCPedestrian,
  BuildingData,
  NPCIdentity,
  NPCActivity,
  NPCActivityType,
} from "./npc-types";
import { createCarInstances, MAX_CARS } from "./npc-car-geometry";
import {
  createPedestrianInstances,
  MAX_PEDESTRIANS,
} from "./npc-pedestrian-geometry";
import {
  buildCarRoute,
  buildPedestrianRoute,
  buildPedestrianCrossRoute,
} from "./npc-router";
import { ExplosionPool } from "./npc-explosion";
import { playCollisionSound, initNPCSounds } from "./npc-sounds";
import { classifyBuilding } from "../simulation/classify-building";
import type { BuildingCategory } from "../simulation/classify-building";
import { gridIndexToColRow, plotCenterMeters } from "../grid/grid-geometry";
import { isGreen } from "./npc-traffic-lights";
import {
  createTrafficLightMeshes,
  updateTrafficLightColors,
  type TrafficLightMeshes,
} from "./npc-traffic-light-mesh";

// Pre-allocated matrix for instanced mesh updates
const _matrix = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _pedScale = new THREE.Vector3(2, 2, 2);
const _euler = new THREE.Euler();

// Singleton
let activeManager: NPCManager | null = null;
export function getActiveNPCManager(): NPCManager | null {
  return activeManager;
}
export function setActiveNPCManager(mgr: NPCManager | null): void {
  activeManager = mgr;
}

const NPC_TICK_INTERVAL = 1 / 20; // 20 Hz
const CAR_SPEED = 12; // m/s (~43 km/h)
const PED_SPEED = 1.4; // m/s (~5 km/h)
const RESPAWN_TIME = 9; // seconds
const COLLISION_DIST = 7; // meters (scaled with 6m car length)
const EXPLOSION_SPEED_THRESHOLD = 10; // m/s
const BUMP_PUSH = 3; // meters to push on slow collision

const TRAFFIC_STOP_DIST = 15; // meters — distance to start braking for red light
const TRAFFIC_DECEL = 0.3; // lerp factor for braking

const WORKPLACE_CATEGORIES = new Set<BuildingCategory>([
  "commercial",
  "industrial",
  "office",
]);

const RESIDENTIAL_CATEGORIES = new Set<BuildingCategory>([
  "residential",
  "luxury",
]);

const SHOPPING_CATEGORIES = new Set<BuildingCategory>([
  "commercial",
  "entertainment",
]);

/** Extract a short label from a building prompt */
function extractLabel(prompt: string): string {
  // Take first 2-3 words as label
  const words = prompt.split(/\s+/).slice(0, 3);
  const label = words.join(" ");
  return label.length > 20 ? label.slice(0, 20) + "..." : label;
}

export interface VisibleNPC {
  key: string;
  x: number;
  y: number;
  z: number;
  name: string;
  isNpc: true;
  activity?: string;
  plotIndex: number;
}

export class NPCManager {
  group: THREE.Group;

  private carMesh: THREE.InstancedMesh;
  private carMaterials: THREE.MeshStandardMaterial[];
  private pedMesh: THREE.InstancedMesh;
  private pedMaterials: THREE.MeshStandardMaterial[];
  private explosions: ExplosionPool;
  private trafficLights: TrafficLightMeshes;

  private cars: NPCCar[] = [];
  private pedestrians: NPCPedestrian[] = [];
  private identities: NPCIdentity[] = [];
  private activeCars = 0;
  private activePeds = 0;

  private tickAccumulator = 0;
  private worldTime = 0;
  private enabled = true;
  private soundInitialized = false;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = "npc-traffic";

    const { mesh: carMesh, materials: carMats } = createCarInstances();
    this.carMesh = carMesh;
    this.carMaterials = carMats;
    this.group.add(carMesh);

    const { mesh: pedMesh, materials: pedMats } = createPedestrianInstances();
    this.pedMesh = pedMesh;
    this.pedMaterials = pedMats;
    this.group.add(pedMesh);

    this.explosions = new ExplosionPool();
    this.group.add(this.explosions.group);

    this.trafficLights = createTrafficLightMeshes();
    this.group.add(this.trafficLights.group);
  }

  private lastAgentCount = -1;

  /** Rebuild NPCs from current building and agent data. Only real agents spawn. */
  rebuild(
    buildings: Array<{
      plotIndex: number;
      prompt: string;
      category?: string | null;
    }>,
    agents?: Array<{
      plotIndex: number;
      name: string;
      wealth: number;
      jobType?: string | null;
    }>
  ): void {
    // No agents = no NPCs
    if (!agents || agents.length === 0) {
      this.cars = [];
      this.pedestrians = [];
      this.identities = [];
      this.activeCars = 0;
      this.activePeds = 0;
      this.carMesh.count = 0;
      this.pedMesh.count = 0;
      this.updateCarMatrices();
      this.updatePedMatrices();
      this.lastAgentCount = 0;
      return;
    }

    // If agent count hasn't changed, skip full rebuild (prevents flicker)
    if (agents.length === this.lastAgentCount && this.cars.length + this.pedestrians.length > 0) {
      return;
    }
    this.lastAgentCount = agents.length;

    // Classify buildings
    const buildingData: BuildingData[] = buildings.map((b) => {
      const cat =
        (b.category as BuildingCategory) || classifyBuilding(b.prompt);
      const { col, row } = gridIndexToColRow(b.plotIndex);
      const [x, z] = plotCenterMeters(col, row);
      return { plotIndex: b.plotIndex, category: cat, x, z, prompt: b.prompt };
    });

    // Build lookup maps
    const buildingByPlot = new Map<number, BuildingData>();
    for (const b of buildingData) buildingByPlot.set(b.plotIndex, b);

    const workplaces = buildingData.filter((b) =>
      WORKPLACE_CATEGORIES.has(b.category)
    );
    const shops = buildingData.filter((b) =>
      SHOPPING_CATEGORIES.has(b.category)
    );
    const carDestinations = workplaces.length > 0 ? workplaces : buildingData;
    const shopDestinations = shops.length > 0 ? shops : buildingData;

    const uniquePlots = new Set(buildingData.map((b) => b.plotIndex));
    const hasCrossRoutes = uniquePlots.size >= 2;

    const CAR_WEALTH_THRESHOLD = 1000;

    // --- Build identity pool + spawn NPCs ---
    this.identities = [];
    this.cars = [];
    this.pedestrians = [];
    this.activeCars = 0;
    this.activePeds = 0;

    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i];
      // Use agent's home building, or fall back to any building so they still appear
      const homeBuilding = buildingByPlot.get(agent.plotIndex)
        ?? buildingData[i % buildingData.length];
      if (!homeBuilding) continue; // no buildings at all — skip

      const canAffordCar = agent.wealth >= CAR_WEALTH_THRESHOLD;

      if (canAffordCar && hasCrossRoutes && this.activeCars < MAX_CARS) {
        // --- Spawn car for this agent ---
        // Pick deterministic destination based on agent index
        let dest: BuildingData;
        let activityType: NPCActivityType;

        if (agent.jobType) {
          const jobWorkplaces = buildingData.filter(
            (b) => b.category === agent.jobType && b.plotIndex !== agent.plotIndex
          );
          if (jobWorkplaces.length > 0) {
            dest = jobWorkplaces[i % jobWorkplaces.length];
            activityType = "commute_to_work";
          } else {
            dest = carDestinations[i % carDestinations.length];
            activityType = "commute_to_work";
          }
        } else if (i % 3 < 2) {
          dest = carDestinations[i % carDestinations.length];
          activityType = "commute_to_work";
        } else {
          dest = shopDestinations[i % shopDestinations.length];
          activityType = "shopping";
        }

        // Ensure different plot
        if (dest.plotIndex === agent.plotIndex) {
          dest = buildingData.find((w) => w.plotIndex !== agent.plotIndex) ?? dest;
        }
        if (dest.plotIndex === agent.plotIndex) {
          // Can't find a cross-plot route — fall through to pedestrian
          this.spawnPedestrian(agent, i, homeBuilding, buildingData, shopDestinations, hasCrossRoutes);
          continue;
        }

        const { col: hc, row: hr } = gridIndexToColRow(agent.plotIndex);
        const { col: wc, row: wr } = gridIndexToColRow(dest.plotIndex);
        const route = buildCarRoute(hc, hr, wc, wr);
        if (route.length < 2) {
          this.spawnPedestrian(agent, i, homeBuilding, buildingData, shopDestinations, hasCrossRoutes);
          continue;
        }

        const colorIndex = i % 8;
        const identityId = this.identities.length;
        const activity: NPCActivity = {
          type: activityType,
          destinationLabel: extractLabel(dest.prompt),
          destinationPlot: dest.plotIndex,
        };

        this.identities.push({
          id: identityId,
          name: agent.name,
          homePlot: agent.plotIndex,
          mode: "driving",
          activity,
          colorIndex,
        });

        // Deterministic speed based on agent index
        const baseSpeed = CAR_SPEED * (0.8 + (((i * 7) % 10) / 10) * 0.4);

        // Deterministic spawn position based on agent's plotIndex
        const startWP = agent.plotIndex % route.length;
        const startProgress = ((agent.plotIndex * 13) % 100) / 100;
        const wp0 = route[startWP];
        const wp1 = route[(startWP + 1) % route.length];
        const spawnX = wp0.x + (wp1.x - wp0.x) * startProgress;
        const spawnZ = wp0.z + (wp1.z - wp0.z) * startProgress;
        const spawnHeading = Math.atan2(wp1.x - wp0.x, wp1.z - wp0.z);

        this.cars.push({
          x: spawnX,
          z: spawnZ,
          heading: spawnHeading,
          waypointIndex: startWP,
          progress: startProgress,
          speed: baseSpeed,
          baseSpeed,
          route,
          colorIndex,
          hidden: false,
          respawnTimer: 0,
          homeWaypoint: route[0],
          identityId,
          stoppedAtLight: false,
        });
        this.activeCars++;
      } else if (this.activePeds < MAX_PEDESTRIANS) {
        // --- Spawn pedestrian for this agent ---
        this.spawnPedestrian(agent, i, homeBuilding, buildingData, shopDestinations, hasCrossRoutes);
      }
    }

    // Update mesh counts
    this.carMesh.count = this.activeCars;
    this.pedMesh.count = this.activePeds;

    // Set initial transforms
    this.updateCarMatrices();
    this.updatePedMatrices();
  }

  /** Spawn a single pedestrian for an agent */
  private spawnPedestrian(
    agent: { plotIndex: number; name: string; wealth: number; jobType?: string | null },
    agentIdx: number,
    homeBuilding: BuildingData,
    buildingData: BuildingData[],
    shopDestinations: BuildingData[],
    hasCrossRoutes: boolean,
  ): void {
    if (this.activePeds >= MAX_PEDESTRIANS) return;

    // Use the building's plot for routing (agent may not have a building on their own plot)
    const spawnPlot = homeBuilding.plotIndex;
    const { col, row } = gridIndexToColRow(spawnPlot);
    let route;
    let activityType: NPCActivityType;
    let destLabel = "";
    let destPlot = spawnPlot;

    // Deterministic activity based on agent index
    const activityChoice = agentIdx % 4;

    if (!hasCrossRoutes || activityChoice === 0) {
      route = buildPedestrianRoute(col, row);
      activityType = "strolling";
      destLabel = extractLabel(homeBuilding.prompt);
    } else if (activityChoice === 1) {
      // Walk to shop
      const shop = shopDestinations[agentIdx % shopDestinations.length];
      if (shop.plotIndex !== spawnPlot) {
        const { col: dc, row: dr } = gridIndexToColRow(shop.plotIndex);
        route = buildPedestrianCrossRoute(col, row, dc, dr);
        activityType = "walking_to_shop";
        destLabel = extractLabel(shop.prompt);
        destPlot = shop.plotIndex;
      } else {
        route = buildPedestrianRoute(col, row);
        activityType = "strolling";
        destLabel = extractLabel(homeBuilding.prompt);
      }
    } else if (activityChoice === 2) {
      // Visit another building
      const other = buildingData[agentIdx % buildingData.length];
      if (other.plotIndex !== spawnPlot) {
        const { col: dc, row: dr } = gridIndexToColRow(other.plotIndex);
        route = buildPedestrianCrossRoute(col, row, dc, dr);
        activityType = "visiting";
        destLabel = extractLabel(other.prompt);
        destPlot = other.plotIndex;
      } else {
        route = buildPedestrianRoute(col, row);
        activityType = "strolling";
        destLabel = extractLabel(homeBuilding.prompt);
      }
    } else {
      route = buildPedestrianRoute(col, row);
      activityType = "strolling";
      destLabel = extractLabel(homeBuilding.prompt);
    }

    if (route.length < 2) return;

    const colorIndex = agentIdx % 8;
    const identityId = this.identities.length;
    const activity: NPCActivity = {
      type: activityType,
      destinationLabel: destLabel,
      destinationPlot: destPlot,
    };

    this.identities.push({
      id: identityId,
      name: agent.name,
      homePlot: agent.plotIndex,
      mode: "walking",
      activity,
      colorIndex,
    });

    // Deterministic spawn position based on agent's plotIndex
    const startIdx = agent.plotIndex % route.length;
    const startProgress = ((agent.plotIndex * 17) % 100) / 100;
    const wp0 = route[startIdx];
    const wp1 = route[(startIdx + 1) % route.length];

    this.pedestrians.push({
      x: wp0.x + (wp1.x - wp0.x) * startProgress,
      z: wp0.z + (wp1.z - wp0.z) * startProgress,
      route,
      waypointIndex: startIdx,
      progress: startProgress,
      speed: PED_SPEED * (0.7 + (((agentIdx * 11) % 10) / 10) * 0.6),
      colorIndex,
      identityId,
    });
    this.activePeds++;
  }

  /** Tick NPC movement. Returns true if anything moved (needs repaint). */
  tick(dt: number): boolean {
    if (!this.enabled) return false;

    // Clamp dt to prevent jumps after tab-away
    dt = Math.min(dt, 0.1);
    this.worldTime += dt;

    this.tickAccumulator += dt;
    if (this.tickAccumulator < NPC_TICK_INTERVAL) {
      // Still update explosions at full framerate
      return this.explosions.update(dt);
    }

    const tickDt = this.tickAccumulator;
    this.tickAccumulator = 0;

    // Update traffic light colors (~every tick, cheap)
    updateTrafficLightColors(
      this.trafficLights.horizontalMesh,
      this.trafficLights.verticalMesh,
      this.worldTime
    );

    let moved = false;

    // Update cars
    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];

      // Handle respawn timer
      if (car.hidden) {
        car.respawnTimer -= tickDt;
        if (car.respawnTimer <= 0) {
          car.hidden = false;
          car.x = car.homeWaypoint.x;
          car.z = car.homeWaypoint.z;
          car.waypointIndex = 0;
          car.progress = 0;
          car.stoppedAtLight = false;
          car.speed = car.baseSpeed;
          this.rebuildCarInstances();
          moved = true;
        }
        continue;
      }

      moved = true;
      this.advanceCarAlongRoute(car, tickDt);
    }

    // Update pedestrians
    for (const ped of this.pedestrians) {
      moved = true;
      this.advancePedestrian(ped, tickDt);
    }

    if (moved) {
      this.updateCarMatrices();
      this.updatePedMatrices();
    }

    const explosionActive = this.explosions.update(dt);
    return moved || explosionActive;
  }

  private advanceCarAlongRoute(npc: NPCCar, dt: number): void {
    const route = npc.route;
    const curr = route[npc.waypointIndex];
    const nextIdx = (npc.waypointIndex + 1) % route.length;
    const next = route[nextIdx];

    const dx = next.x - curr.x;
    const dz = next.z - curr.z;
    const segLen = Math.sqrt(dx * dx + dz * dz);
    if (segLen < 0.01) {
      npc.waypointIndex = nextIdx;
      return;
    }

    // --- Traffic light check ---
    // Check next waypoint's intersection for red light
    if (
      next.intersectionId !== undefined &&
      next.intersectionId >= 0 &&
      next.travelDirection
    ) {
      // How far to intersection center?
      const distToIntersection =
        segLen * (1 - npc.progress); // remaining distance on this segment

      if (distToIntersection < TRAFFIC_STOP_DIST) {
        const green = isGreen(
          next.intersectionId,
          next.travelDirection,
          this.worldTime
        );
        if (!green) {
          // Decelerate to stop
          npc.speed = npc.speed * (1 - TRAFFIC_DECEL);
          if (npc.speed < 0.5) npc.speed = 0;
          npc.stoppedAtLight = true;
        } else if (npc.stoppedAtLight) {
          // Green — accelerate back to base speed
          npc.speed = Math.min(
            npc.speed + npc.baseSpeed * 0.15,
            npc.baseSpeed
          );
          if (npc.speed >= npc.baseSpeed * 0.95) {
            npc.stoppedAtLight = false;
            npc.speed = npc.baseSpeed;
          }
        }
      }
    } else if (npc.stoppedAtLight) {
      // No intersection ahead — resume speed
      npc.speed = Math.min(
        npc.speed + npc.baseSpeed * 0.15,
        npc.baseSpeed
      );
      if (npc.speed >= npc.baseSpeed * 0.95) {
        npc.stoppedAtLight = false;
        npc.speed = npc.baseSpeed;
      }
    }

    npc.progress += (npc.speed * dt) / segLen;

    if (npc.progress >= 1) {
      npc.progress = 0;
      npc.waypointIndex = nextIdx;
    }

    const t = npc.progress;
    npc.x = curr.x + dx * t;
    npc.z = curr.z + dz * t;
    npc.heading = Math.atan2(dx, dz);
  }

  private advancePedestrian(ped: NPCPedestrian, dt: number): void {
    const route = ped.route;
    const curr = route[ped.waypointIndex];
    const next = route[(ped.waypointIndex + 1) % route.length];

    const dx = next.x - curr.x;
    const dz = next.z - curr.z;
    const segLen = Math.sqrt(dx * dx + dz * dz);
    if (segLen < 0.01) {
      ped.waypointIndex = (ped.waypointIndex + 1) % route.length;
      return;
    }

    ped.progress += (ped.speed * dt) / segLen;

    if (ped.progress >= 1) {
      ped.progress = 0;
      ped.waypointIndex = (ped.waypointIndex + 1) % route.length;
    }

    const t = ped.progress;
    ped.x = curr.x + dx * t;
    ped.z = curr.z + dz * t;
  }

  private updateCarMatrices(): void {
    let instanceIdx = 0;
    for (const car of this.cars) {
      if (car.hidden) continue;
      _euler.set(0, car.heading - Math.PI / 2, 0);
      _quat.setFromEuler(_euler);
      _pos.set(car.x, 0, car.z);
      _matrix.compose(_pos, _quat, _scale);
      this.carMesh.setMatrixAt(instanceIdx, _matrix);
      instanceIdx++;
    }
    this.carMesh.count = instanceIdx;
    this.carMesh.instanceMatrix.needsUpdate = true;
  }

  private updatePedMatrices(): void {
    for (let i = 0; i < this.pedestrians.length; i++) {
      const ped = this.pedestrians[i];
      _pos.set(ped.x, 0, ped.z);
      _quat.identity();
      _matrix.compose(_pos, _quat, _pedScale);
      this.pedMesh.setMatrixAt(i, _matrix);
    }
    this.pedMesh.count = this.pedestrians.length;
    this.pedMesh.instanceMatrix.needsUpdate = true;
  }

  private rebuildCarInstances(): void {
    this.updateCarMatrices();
  }

  /**
   * Get visible NPCs within maxDist of camera for name tag rendering.
   * Returns positions in world space.
   */
  getVisibleNPCs(
    cameraX: number,
    cameraZ: number,
    maxDist = 300
  ): VisibleNPC[] {
    const result: VisibleNPC[] = [];
    const maxDist2 = maxDist * maxDist;

    // Cars
    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];
      if (car.hidden) continue;
      const dx = car.x - cameraX;
      const dz = car.z - cameraZ;
      if (dx * dx + dz * dz > maxDist2) continue;

      const identity = this.identities[car.identityId];
      if (!identity) continue;

      result.push({
        key: `npc-car-${i}`,
        x: car.x,
        y: 3.5, // above car
        z: car.z,
        name: identity.name,
        isNpc: true,
        activity: this.formatActivity(identity),
        plotIndex: identity.homePlot,
      });
    }

    // Pedestrians
    for (let i = 0; i < this.pedestrians.length; i++) {
      const ped = this.pedestrians[i];
      const dx = ped.x - cameraX;
      const dz = ped.z - cameraZ;
      if (dx * dx + dz * dz > maxDist2) continue;

      const identity = this.identities[ped.identityId];
      if (!identity) continue;

      result.push({
        key: `npc-ped-${i}`,
        x: ped.x,
        y: 2.5, // above head
        z: ped.z,
        name: identity.name,
        isNpc: true,
        activity: this.formatActivity(identity),
        plotIndex: identity.homePlot,
      });
    }

    return result;
  }

  /** Format activity string for tooltip display */
  private formatActivity(identity: NPCIdentity): string {
    const { activity } = identity;
    switch (activity.type) {
      case "commute_to_work":
        return `${identity.name} → ${activity.destinationLabel}`;
      case "commute_home":
        return `${identity.name} heading home`;
      case "shopping":
        return `${identity.name} → ${activity.destinationLabel}`;
      case "leisure":
        return `${identity.name} → ${activity.destinationLabel}`;
      case "visiting":
        return `${identity.name} visiting ${activity.destinationLabel}`;
      case "walking_to_shop":
        return `${identity.name} → ${activity.destinationLabel}`;
      case "walking_home":
        return `${identity.name} walking home`;
      case "strolling":
        return `${identity.name} strolling`;
    }
  }

  /** Get NPC identity by car or ped instance index from raycasting */
  getNPCAtCarInstance(instanceId: number): NPCIdentity | null {
    // Map instanceId back to car index (skipping hidden)
    let idx = 0;
    for (const car of this.cars) {
      if (car.hidden) continue;
      if (idx === instanceId) {
        return this.identities[car.identityId] ?? null;
      }
      idx++;
    }
    return null;
  }

  getNPCAtPedInstance(instanceId: number): NPCIdentity | null {
    const ped = this.pedestrians[instanceId];
    if (!ped) return null;
    return this.identities[ped.identityId] ?? null;
  }

  /** Get the car InstancedMesh (for raycasting) */
  getCarMesh(): THREE.InstancedMesh {
    return this.carMesh;
  }

  /** Get the pedestrian InstancedMesh (for raycasting) */
  getPedMesh(): THREE.InstancedMesh {
    return this.pedMesh;
  }

  /** Check if the player car collides with any NPC car */
  checkPlayerCollision(
    playerX: number,
    playerZ: number,
    playerSpeed: number
  ): void {
    if (!this.enabled) return;

    // Lazy-init sounds on first collision check (user has interacted)
    if (!this.soundInitialized) {
      this.soundInitialized = true;
      initNPCSounds();
    }

    const absSpeed = Math.abs(playerSpeed);
    if (absSpeed < 2) return;

    for (const car of this.cars) {
      if (car.hidden) continue;

      const dx = Math.abs(playerX - car.x);
      const dz = Math.abs(playerZ - car.z);
      if (dx > COLLISION_DIST || dz > COLLISION_DIST) continue;

      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > COLLISION_DIST) continue;

      if (absSpeed >= EXPLOSION_SPEED_THRESHOLD) {
        this.explosions.trigger(car.x, car.z);
        playCollisionSound();

        car.hidden = true;
        car.respawnTimer = RESPAWN_TIME + Math.random() * 2;
        this.rebuildCarInstances();
      } else {
        const pushDirX = car.x - playerX;
        const pushDirZ = car.z - playerZ;
        const pushLen = Math.sqrt(
          pushDirX * pushDirX + pushDirZ * pushDirZ
        );
        if (pushLen > 0.01) {
          car.x += (pushDirX / pushLen) * BUMP_PUSH;
          car.z += (pushDirZ / pushLen) * BUMP_PUSH;
        }
      }
    }
  }

  /** Export current car positions for Convex sync. */
  getCarSnapshots(): Array<{
    index: number;
    x: number;
    z: number;
    heading: number;
    speed: number;
    colorIndex: number;
  }> {
    const snapshots: Array<{
      index: number;
      x: number;
      z: number;
      heading: number;
      speed: number;
      colorIndex: number;
    }> = [];
    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];
      if (car.hidden) continue;
      snapshots.push({
        index: i,
        x: Math.round(car.x * 10) / 10,
        z: Math.round(car.z * 10) / 10,
        heading: Math.round(car.heading * 100) / 100,
        speed: Math.round(car.speed * 10) / 10,
        colorIndex: car.colorIndex,
      });
    }
    return snapshots;
  }

  /** Enable/disable NPC rendering (quality degradation) */
  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.group.visible = enabled;
  }

  dispose(): void {
    this.carMesh.dispose();
    this.pedMesh.dispose();
    for (const m of this.carMaterials) m.dispose();
    for (const m of this.pedMaterials) m.dispose();
    this.explosions.dispose();
    this.trafficLights.horizontalMesh.dispose();
    this.trafficLights.verticalMesh.dispose();
    this.trafficLights.material.dispose();
  }
}
