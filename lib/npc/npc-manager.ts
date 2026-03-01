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
import { drawNames } from "./npc-names";
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

  /** Rebuild NPCs from current building data */
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
    // Classify buildings
    const buildingData: BuildingData[] = buildings.map((b) => {
      const cat =
        (b.category as BuildingCategory) || classifyBuilding(b.prompt);
      const { col, row } = gridIndexToColRow(b.plotIndex);
      const [x, z] = plotCenterMeters(col, row);
      return { plotIndex: b.plotIndex, category: cat, x, z, prompt: b.prompt };
    });

    // Group by category
    const homes = buildingData.filter((b) =>
      RESIDENTIAL_CATEGORIES.has(b.category)
    );
    const workplaces = buildingData.filter((b) =>
      WORKPLACE_CATEGORIES.has(b.category)
    );
    const shops = buildingData.filter((b) =>
      SHOPPING_CATEGORIES.has(b.category)
    );

    // Fallback: if no residential, treat all buildings as both origins and destinations
    const carOrigins = homes.length > 0 ? homes : buildingData;
    const carDestinations =
      workplaces.length > 0 ? workplaces : buildingData;
    const shopDestinations = shops.length > 0 ? shops : buildingData;

    const uniquePlots = new Set(buildingData.map((b) => b.plotIndex));
    const hasCrossRoutes = uniquePlots.size >= 2;

    // Build agent lookup by plot for name/wealth integration
    const agentByPlot = new Map<number, { name: string; wealth: number; jobType?: string | null }>();
    if (agents) {
      for (const a of agents) agentByPlot.set(a.plotIndex, a);
    }

    // Agents with wealth >= 200 can afford a car, others walk
    const CAR_WEALTH_THRESHOLD = 200;
    const carAgents = agents
      ? agents.filter((a) => a.wealth >= CAR_WEALTH_THRESHOLD && carOrigins.some((h) => h.plotIndex === a.plotIndex))
      : [];

    // Determine NPC counts scaled with buildings
    // If agents provided, car count = agents who can afford cars; otherwise ~2 per residential
    const rawCarCount = hasCrossRoutes
      ? Math.min(
          carAgents.length > 0 ? carAgents.length : carOrigins.length * 2,
          MAX_CARS
        )
      : 0;
    const rawPedCount = Math.min(buildingData.length * 3, MAX_PEDESTRIANS);

    // Use agent names when available, fall back to random pool
    const agentNames = agents ? agents.map((a) => a.name) : [];
    const totalNPCs = rawCarCount + rawPedCount;
    const fallbackNames = drawNames(Math.max(0, totalNPCs - agentNames.length));
    const names = [...agentNames, ...fallbackNames];

    // --- Build identity pool ---
    this.identities = [];

    // --- Spawn cars ---
    this.cars = [];
    this.activeCars = 0;

    if (hasCrossRoutes) {
      for (let i = 0; i < rawCarCount; i++) {
        // If agents provided, use agent's home plot; otherwise cycle through residential
        const agent = carAgents.length > 0 ? carAgents[i % carAgents.length] : null;
        const home = agent
          ? (carOrigins.find((h) => h.plotIndex === agent.plotIndex) ?? carOrigins[i % carOrigins.length])
          : carOrigins[i % carOrigins.length];

        // Pick activity based on agent job type, or random
        const roll = Math.random();
        let dest: BuildingData;
        let activityType: NPCActivityType;

        if (agent?.jobType) {
          // Agent has a job — commute to a matching workplace
          const jobWorkplaces = buildingData.filter(
            (b) => b.category === agent.jobType && b.plotIndex !== home.plotIndex
          );
          if (jobWorkplaces.length > 0) {
            dest = jobWorkplaces[i % jobWorkplaces.length];
            activityType = "commute_to_work";
          } else if (roll < 0.6) {
            dest = carDestinations[i % carDestinations.length];
            activityType = "commute_to_work";
          } else {
            dest = shopDestinations[i % shopDestinations.length];
            activityType = "shopping";
          }
        } else if (roll < 0.6) {
          // Commute to work
          dest = carDestinations[i % carDestinations.length];
          activityType = "commute_to_work";
        } else if (roll < 0.85) {
          // Shopping
          dest = shopDestinations[i % shopDestinations.length];
          activityType = "shopping";
        } else {
          // Leisure — pick random building
          dest = buildingData[Math.floor(Math.random() * buildingData.length)];
          activityType = "leisure";
        }

        // Ensure different plot
        if (dest.plotIndex === home.plotIndex) {
          dest =
            buildingData.find((w) => w.plotIndex !== home.plotIndex) ?? dest;
        }
        if (dest.plotIndex === home.plotIndex) continue;

        const { col: hc, row: hr } = gridIndexToColRow(home.plotIndex);
        const { col: wc, row: wr } = gridIndexToColRow(dest.plotIndex);

        const route = buildCarRoute(hc, hr, wc, wr);
        if (route.length < 2) continue;

        const colorIndex = i % 8;
        const identityId = this.identities.length;
        const activity: NPCActivity = {
          type: activityType,
          destinationLabel: extractLabel(dest.prompt),
          destinationPlot: dest.plotIndex,
        };

        this.identities.push({
          id: identityId,
          name: agent?.name ?? names[identityId] ?? "NPC",
          homePlot: home.plotIndex,
          mode: "driving",
          activity,
          colorIndex,
        });

        const baseSpeed = CAR_SPEED * (0.8 + Math.random() * 0.4);

        // Stagger spawn position along route to avoid overlap at origin
        const startWP = Math.floor(Math.random() * route.length);
        const startProgress = Math.random();
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
      }
      this.activeCars = this.cars.length;
    }

    // --- Spawn pedestrians ---
    this.pedestrians = [];
    this.activePeds = 0;

    if (buildingData.length > 0) {
      let pedCount = 0;
      const nameOffset = this.identities.length;

      for (const building of buildingData) {
        const numPeds = 2 + Math.floor(Math.random() * 2); // 2-3 per building
        const { col, row } = gridIndexToColRow(building.plotIndex);

        for (let j = 0; j < numPeds && pedCount < rawPedCount; j++) {
          // Decide activity: 30% stroll own plot, rest cross-plot if possible
          const roll = Math.random();
          let route;
          let activityType: NPCActivityType;
          let destLabel = "";
          let destPlot = building.plotIndex;

          if (!hasCrossRoutes || roll < 0.3) {
            // Stroll own plot
            route = buildPedestrianRoute(col, row);
            activityType = "strolling";
            destLabel = extractLabel(building.prompt);
          } else if (roll < 0.5) {
            // Walk to shop
            const shop =
              shopDestinations[
                Math.floor(Math.random() * shopDestinations.length)
              ];
            if (shop.plotIndex !== building.plotIndex) {
              const { col: dc, row: dr } = gridIndexToColRow(shop.plotIndex);
              route = buildPedestrianCrossRoute(col, row, dc, dr);
              activityType = "walking_to_shop";
              destLabel = extractLabel(shop.prompt);
              destPlot = shop.plotIndex;
            } else {
              route = buildPedestrianRoute(col, row);
              activityType = "strolling";
              destLabel = extractLabel(building.prompt);
            }
          } else if (roll < 0.7) {
            // Walk to work
            const work =
              carDestinations[
                Math.floor(Math.random() * carDestinations.length)
              ];
            if (work.plotIndex !== building.plotIndex) {
              const { col: dc, row: dr } = gridIndexToColRow(work.plotIndex);
              route = buildPedestrianCrossRoute(col, row, dc, dr);
              activityType = "walking_to_shop"; // reuse label logic
              destLabel = extractLabel(work.prompt);
              destPlot = work.plotIndex;
            } else {
              route = buildPedestrianRoute(col, row);
              activityType = "strolling";
              destLabel = extractLabel(building.prompt);
            }
          } else {
            // Visit friend — pick random building on different plot
            const friend =
              buildingData[Math.floor(Math.random() * buildingData.length)];
            if (friend.plotIndex !== building.plotIndex) {
              const { col: dc, row: dr } = gridIndexToColRow(
                friend.plotIndex
              );
              route = buildPedestrianCrossRoute(col, row, dc, dr);
              activityType = "visiting";
              destLabel = extractLabel(friend.prompt);
              destPlot = friend.plotIndex;
            } else {
              route = buildPedestrianRoute(col, row);
              activityType = "strolling";
              destLabel = extractLabel(building.prompt);
            }
          }

          if (route.length < 2) continue;

          const colorIndex = pedCount % 8;
          const identityId = this.identities.length;
          const activity: NPCActivity = {
            type: activityType,
            destinationLabel: destLabel,
            destinationPlot: destPlot,
          };

          // Use agent name if a pedestrian is on an agent's home plot
          const plotAgent = agentByPlot.get(building.plotIndex);
          const pedName = (pedCount === 0 && plotAgent)
            ? plotAgent.name
            : (names[nameOffset + pedCount] ?? "NPC");

          this.identities.push({
            id: identityId,
            name: pedName,
            homePlot: building.plotIndex,
            mode: "walking",
            activity,
            colorIndex,
          });

          const startIdx = Math.floor(Math.random() * route.length);
          this.pedestrians.push({
            x: route[startIdx].x,
            z: route[startIdx].z,
            route,
            waypointIndex: startIdx,
            progress: Math.random(),
            speed: PED_SPEED * (0.7 + Math.random() * 0.6),
            colorIndex,
            identityId,
          });
          pedCount++;
        }
      }
      this.activePeds = this.pedestrians.length;
    }

    // Update mesh counts
    this.carMesh.count = this.activeCars;
    this.pedMesh.count = this.activePeds;

    // Set initial transforms
    this.updateCarMatrices();
    this.updatePedMatrices();
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
      _matrix.compose(_pos, _quat, _scale);
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
