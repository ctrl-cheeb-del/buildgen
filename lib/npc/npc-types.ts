import type { BuildingCategory } from "../simulation/classify-building";

export interface Waypoint {
  x: number;
  z: number;
  /** Intersection index (0-98) if this waypoint sits on an intersection, else -1 */
  intersectionId?: number;
  /** Travel direction through intersection: "horizontal" | "vertical" */
  travelDirection?: "horizontal" | "vertical";
}

/** Activity types for NPC purpose */
export type NPCActivityType =
  | "commute_to_work"
  | "commute_home"
  | "shopping"
  | "leisure"
  | "visiting"
  | "walking_to_shop"
  | "walking_home"
  | "strolling";

export interface NPCActivity {
  type: NPCActivityType;
  destinationLabel: string;
  destinationPlot: number;
}

export interface NPCIdentity {
  id: number;
  name: string;
  homePlot: number;
  mode: "driving" | "walking";
  activity: NPCActivity;
  colorIndex: number;
}

export interface NPCCar {
  /** Current position */
  x: number;
  z: number;
  /** Heading in radians */
  heading: number;
  /** Index into waypoints array */
  waypointIndex: number;
  /** Fractional progress [0,1] between current and next waypoint */
  progress: number;
  /** Speed in m/s */
  speed: number;
  /** Base speed (before traffic light deceleration) */
  baseSpeed: number;
  /** Route waypoints */
  route: Waypoint[];
  /** Color index (0-7) */
  colorIndex: number;
  /** Whether currently hidden (exploded) */
  hidden: boolean;
  /** Respawn timer (seconds remaining, 0 = active) */
  respawnTimer: number;
  /** Home plot waypoint for respawn */
  homeWaypoint: Waypoint;
  /** Identity index into the NPC pool */
  identityId: number;
  /** Whether stopped at a red light */
  stoppedAtLight: boolean;
}

export interface NPCPedestrian {
  x: number;
  z: number;
  /** Route waypoints (pavement loop or cross-plot) */
  route: Waypoint[];
  waypointIndex: number;
  progress: number;
  speed: number;
  colorIndex: number;
  /** Identity index into the NPC pool */
  identityId: number;
}

export interface BuildingData {
  plotIndex: number;
  category: BuildingCategory;
  x: number;
  z: number;
  prompt: string;
}
