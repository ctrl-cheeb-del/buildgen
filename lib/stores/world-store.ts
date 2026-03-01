import { create } from "zustand";
import * as THREE from "three";
import type { WorldBuilding } from "../types";
import type { SceneLayer } from "../viewer/scene-layer";
import { createBuildingLOD } from "../viewer/building-lod";

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
  replayHiddenIds: Set<string>;

  setLayer: (layer: SceneLayer) => void;
  setConvexUpdateTransform: (fn: ConvexUpdateFn) => void;
  setOwnedBuildingIds: (ids: Set<string>) => void;
  setIsDragging: (dragging: boolean) => void;
  setReplayHiddenIds: (ids: Set<string>) => void;
  revealBuilding: (id: string) => void;
  addBuilding: (building: WorldBuilding, modelGroup: THREE.Group) => void;
  replaceGeometry: (id: string, newModelGroup: THREE.Group) => void;
  removeBuilding: (id: string) => void;
  selectBuilding: (id: string | null) => void;
  updateTransform: (
    id: string,
    updates: Partial<Pick<WorldBuilding, "scale" | "offset" | "rotation">>
  ) => void;
  /** Apply transform from Convex without triggering Convex sync (prevents loop) */
  applyRemoteTransform: (
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
  replayHiddenIds: new Set(),

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

  setReplayHiddenIds: (ids) => {
    set({ replayHiddenIds: ids });
    // Hide containers that match the hidden set
    const state = get();
    for (const id of ids) {
      const container = state.containers.get(id);
      if (container) {
        container.visible = false;
        container.scale.set(0, 0, 0);
      }
    }
    state.layer?.repaint();
  },

  revealBuilding: (id) => {
    const state = get();
    const container = state.containers.get(id);
    const building = state.buildings.get(id);
    if (!container || !building) return;

    // Remove from hidden set
    const newHidden = new Set(state.replayHiddenIds);
    newHidden.delete(id);
    set({ replayHiddenIds: newHidden });

    // Animate scale 0→1 over 500ms (ease-out cubic)
    container.visible = true;
    const targetScale = building.scale;
    const startTime = performance.now();
    const duration = 500;
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const s = eased * targetScale;
      container.scale.set(s, s, s);
      state.layer?.repaint();
      if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  },

  addBuilding: (building, modelGroup) => {
    const state = get();
    // Skip if already added
    if (state.buildings.has(building.id)) return;

    const container = new THREE.Group();
    container.name = `building-${building.id}`;
    const lod = createBuildingLOD(modelGroup);
    container.add(lod);

    applyTransforms(building, container);

    // If this building is hidden for replay, start invisible at scale 0
    if (state.replayHiddenIds.has(building.id)) {
      container.visible = false;
      container.scale.set(0, 0, 0);
    } else {
      container.visible = building.visible;
    }

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

  replaceGeometry: (id, newModelGroup) => {
    const state = get();
    const container = state.containers.get(id);
    if (!container) return;

    // Dispose old meshes inside the container
    const toRemove: THREE.Object3D[] = [];
    for (const child of container.children) {
      child.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      toRemove.push(child);
    }
    for (const child of toRemove) {
      container.remove(child);
    }

    // Add new geometry wrapped in LOD
    const lod = createBuildingLOD(newModelGroup);
    container.add(lod);
    state.layer?.repaint();
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

  applyRemoteTransform: (id, updates) => {
    const state = get();
    const building = state.buildings.get(id);
    const container = state.containers.get(id);
    if (!building || !container) return;

    if (updates.scale !== undefined) building.scale = updates.scale;
    if (updates.offset !== undefined) building.offset = [...updates.offset];
    if (updates.rotation !== undefined)
      building.rotation = [...updates.rotation];

    applyTransforms(building, container);
    state.layer?.repaint();
    // No Convex sync — this data came FROM Convex
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
