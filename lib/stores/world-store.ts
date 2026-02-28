import { create } from "zustand";
import * as THREE from "three";
import type { WorldBuilding } from "../types";
import type { SceneLayer } from "../viewer/scene-layer";

type ConvexUpdateFn = (
  buildingId: string,
  position?: { x: number; y: number; z: number },
  rotation?: { x: number; y: number; z: number },
  scale?: number
) => void;

interface WorldState {
  buildings: Map<string, WorldBuilding>;
  containers: Map<string, THREE.Group>;
  selectedId: string | null;
  layer: SceneLayer | null;
  convexUpdateTransform: ConvexUpdateFn | null;
  ownedBuildingIds: Set<string>;
  isDragging: boolean;

  setLayer: (layer: SceneLayer) => void;
  setConvexUpdateTransform: (fn: ConvexUpdateFn) => void;
  setOwnedBuildingIds: (ids: Set<string>) => void;
  setIsDragging: (dragging: boolean) => void;
  addBuilding: (building: WorldBuilding, modelGroup: THREE.Group) => void;
  removeBuilding: (id: string) => void;
  selectBuilding: (id: string | null) => void;
  updateTransform: (
    id: string,
    updates: Partial<Pick<WorldBuilding, "scale" | "offset" | "rotation">>
  ) => void;
  getAllBuildings: () => WorldBuilding[];
  generateId: () => string;
  clear: () => void;
}

/**
 * Position a building container in meter-space.
 * building.x/z = plot center in meters from origin.
 * building.offset = user drag offset within the plot.
 */
function applyTransforms(building: WorldBuilding, container: THREE.Group) {
  container.position.set(
    building.x + building.offset[0],
    building.offset[1],
    building.z + building.offset[2]
  );
  container.scale.setScalar(building.scale);
  container.rotation.set(
    (building.rotation[0] * Math.PI) / 180,
    (building.rotation[1] * Math.PI) / 180,
    (building.rotation[2] * Math.PI) / 180
  );
}

// Debounce map for Convex sync
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const useWorldStore = create<WorldState>((set, get) => ({
  buildings: new Map(),
  containers: new Map(),
  selectedId: null,
  layer: null,
  convexUpdateTransform: null,
  ownedBuildingIds: new Set(),
  isDragging: false,

  setLayer: (layer) => {
    set({ layer });
  },

  setConvexUpdateTransform: (fn) => {
    set({ convexUpdateTransform: fn });
  },

  setOwnedBuildingIds: (ids) => {
    set({ ownedBuildingIds: ids });
  },

  setIsDragging: (dragging) => {
    set({ isDragging: dragging });
  },

  addBuilding: (building, modelGroup) => {
    const state = get();
    // Skip if already added
    if (state.buildings.has(building.id)) return;

    const container = new THREE.Group();
    container.name = `building-${building.id}`;
    container.add(modelGroup);

    applyTransforms(building, container);
    container.visible = building.visible;

    const newBuildings = new Map(state.buildings);
    newBuildings.set(building.id, building);
    const newContainers = new Map(state.containers);
    newContainers.set(building.id, container);

    state.layer?.addGroup(container);

    set({
      buildings: newBuildings,
      containers: newContainers,
      selectedId: building.id,
    });
  },

  removeBuilding: (id) => {
    const state = get();
    const container = state.containers.get(id);
    if (container) {
      state.layer?.removeGroup(container);
      container.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
    }

    const newBuildings = new Map(state.buildings);
    newBuildings.delete(id);
    const newContainers = new Map(state.containers);
    newContainers.delete(id);

    let selectedId = state.selectedId;
    if (selectedId === id) {
      const ids = [...newBuildings.keys()];
      selectedId = ids.length > 0 ? ids[ids.length - 1] : null;
    }

    set({ buildings: newBuildings, containers: newContainers, selectedId });
  },

  selectBuilding: (id) => {
    if (get().selectedId === id) return;
    set({ selectedId: id });
  },

  updateTransform: (id, updates) => {
    const state = get();
    const building = state.buildings.get(id);
    const container = state.containers.get(id);
    if (!building || !container) return;

    // Mutate building record in-place to avoid Map recreation.
    // During drag this is called every mousemove — recreating the Map
    // would trigger React re-render storms.
    if (updates.scale !== undefined) building.scale = updates.scale;
    if (updates.offset !== undefined) building.offset = [...updates.offset];
    if (updates.rotation !== undefined)
      building.rotation = [...updates.rotation];

    applyTransforms(building, container);
    state.layer?.repaint();

    // Debounced Convex sync
    const syncFn = state.convexUpdateTransform;
    if (syncFn) {
      const existing = debounceTimers.get(id);
      if (existing) clearTimeout(existing);
      debounceTimers.set(
        id,
        setTimeout(() => {
          debounceTimers.delete(id);
          syncFn(
            id,
            { x: building.offset[0], y: building.offset[1], z: building.offset[2] },
            { x: building.rotation[0], y: building.rotation[1], z: building.rotation[2] },
            building.scale
          );
        }, 200)
      );
    }
  },

  getAllBuildings: () => {
    return Array.from(get().buildings.values());
  },

  generateId: () => {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  },

  clear: () => {
    const state = get();
    for (const id of [...state.buildings.keys()]) {
      get().removeBuilding(id);
    }
  },
}));
