import { create } from "zustand";
import * as THREE from "three";
import mapboxgl from "mapbox-gl";
import type { WorldBuilding, WorldSaveFile } from "../types";
import type { ThreeJSMapboxLayer } from "../viewer/mapbox-layer";
import { loadProceduralGeometry } from "../viewer/procedural-loader";

const WORLD_STORAGE_KEY = "building-generator-world";

interface WorldState {
  buildings: Map<string, WorldBuilding>;
  containers: Map<string, THREE.Group>;
  selectedId: string | null;
  layer: ThreeJSMapboxLayer | null;
  origin: [number, number];

  // Actions
  setLayer: (layer: ThreeJSMapboxLayer) => void;
  addBuilding: (building: WorldBuilding, modelGroup: THREE.Group) => void;
  removeBuilding: (id: string) => void;
  selectBuilding: (id: string | null) => void;
  toggleVisibility: (id: string) => void;
  updateTransform: (
    id: string,
    updates: Partial<Pick<WorldBuilding, "scale" | "offset" | "rotation">>
  ) => void;
  updatePosition: (id: string, lng: number, lat: number) => void;
  getSelected: () => WorldBuilding | null;
  getAllBuildings: () => WorldBuilding[];
  exportWorld: () => WorldSaveFile;
  importWorld: (data: WorldSaveFile) => Promise<void>;
  restoreFromLocalStorage: () => Promise<void>;
  generateId: () => string;
  clear: () => void;
}

function applyTransforms(
  building: WorldBuilding,
  container: THREE.Group,
  layer: ThreeJSMapboxLayer | null,
  origin: [number, number]
) {
  if (!layer) return;

  const meterScale = layer.getMeterScale();
  const originMerc = mapboxgl.MercatorCoordinate.fromLngLat(origin, 0);
  const buildingMerc = mapboxgl.MercatorCoordinate.fromLngLat(
    [building.lng, building.lat],
    0
  );

  const sceneX =
    (buildingMerc.x - originMerc.x) / meterScale + building.offset[0];
  const sceneY = building.offset[1];
  const sceneZ =
    (buildingMerc.y - originMerc.y) / meterScale + building.offset[2];

  container.position.set(sceneX, sceneY, sceneZ);
  container.scale.set(building.scale, building.scale, building.scale);
  container.rotation.set(
    (building.rotation[0] * Math.PI) / 180,
    (building.rotation[1] * Math.PI) / 180,
    (building.rotation[2] * Math.PI) / 180
  );
}

function autoSave(buildings: Map<string, WorldBuilding>, origin: [number, number]) {
  try {
    const data: WorldSaveFile = {
      version: 1,
      name: "My World",
      savedAt: new Date().toISOString(),
      origin,
      buildings: Array.from(buildings.values()).map((b) => ({
        ...b,
        glbBase64: b.glbBase64 ? "__stripped__" : undefined,
      })),
    };
    localStorage.setItem(WORLD_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("[World] Auto-save to localStorage failed:", e);
  }
}

export const useWorldStore = create<WorldState>((set, get) => ({
  buildings: new Map(),
  containers: new Map(),
  selectedId: null,
  layer: null,
  origin: [0, 0] as [number, number],

  setLayer: (layer) => {
    set({ layer, origin: layer.getOrigin() });
  },

  addBuilding: (building, modelGroup) => {
    const state = get();
    const container = new THREE.Group();
    container.name = `building-${building.id}`;
    container.add(modelGroup);

    applyTransforms(building, container, state.layer, state.origin);
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

    autoSave(newBuildings, state.origin);
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
    autoSave(newBuildings, state.origin);
  },

  selectBuilding: (id) => {
    if (get().selectedId === id) return;
    set({ selectedId: id });
  },

  toggleVisibility: (id) => {
    const state = get();
    const building = state.buildings.get(id);
    const container = state.containers.get(id);
    if (!building || !container) return;

    const updated = { ...building, visible: !building.visible };
    container.visible = updated.visible;
    state.layer?.repaint();

    const newBuildings = new Map(state.buildings);
    newBuildings.set(id, updated);
    set({ buildings: newBuildings });
    autoSave(newBuildings, state.origin);
  },

  updateTransform: (id, updates) => {
    const state = get();
    const building = state.buildings.get(id);
    const container = state.containers.get(id);
    if (!building || !container) return;

    const updated = { ...building };
    if (updates.scale !== undefined) updated.scale = updates.scale;
    if (updates.offset !== undefined) updated.offset = [...updates.offset];
    if (updates.rotation !== undefined) updated.rotation = [...updates.rotation];

    applyTransforms(updated, container, state.layer, state.origin);
    state.layer?.repaint();

    const newBuildings = new Map(state.buildings);
    newBuildings.set(id, updated);
    set({ buildings: newBuildings });
    autoSave(newBuildings, state.origin);
  },

  updatePosition: (id, lng, lat) => {
    const state = get();
    const building = state.buildings.get(id);
    const container = state.containers.get(id);
    if (!building || !container) return;

    const updated = { ...building, lng, lat };
    applyTransforms(updated, container, state.layer, state.origin);
    state.layer?.repaint();

    const newBuildings = new Map(state.buildings);
    newBuildings.set(id, updated);
    set({ buildings: newBuildings });
    autoSave(newBuildings, state.origin);
  },

  getSelected: () => {
    const state = get();
    if (!state.selectedId) return null;
    return state.buildings.get(state.selectedId) ?? null;
  },

  getAllBuildings: () => {
    return Array.from(get().buildings.values());
  },

  exportWorld: () => {
    const state = get();
    return {
      version: 1 as const,
      name: "My World",
      savedAt: new Date().toISOString(),
      origin: state.origin,
      buildings: Array.from(state.buildings.values()),
    };
  },

  importWorld: async (data) => {
    if (data.version !== 1) {
      throw new Error(`Unsupported world version: ${data.version}`);
    }
    const state = get();

    // Clear existing
    for (const id of [...state.buildings.keys()]) {
      get().removeBuilding(id);
    }

    // Reconstruct buildings
    for (const b of data.buildings) {
      let modelGroup: THREE.Group;
      try {
        if (b.path === "A" && b.proceduralCode) {
          modelGroup = loadProceduralGeometry(b.proceduralCode);
        } else {
          continue;
        }
      } catch (err) {
        console.warn(
          `[World] Failed to load building "${b.name}" (${b.id}):`,
          err
        );
        continue;
      }

      get().addBuilding({ ...b }, modelGroup);
    }
  },

  restoreFromLocalStorage: async () => {
    try {
      const raw = localStorage.getItem(WORLD_STORAGE_KEY);
      if (!raw) return;
      const data: WorldSaveFile = JSON.parse(raw);
      if (data.version !== 1 || !data.buildings?.length) return;
      await get().importWorld(data);
      console.log(
        `[World] Restored ${data.buildings.length} building(s) from localStorage`
      );
    } catch (e) {
      console.warn("[World] Failed to restore from localStorage:", e);
    }
  },

  generateId: () => {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  },

  clear: () => {
    const state = get();
    for (const id of [...state.buildings.keys()]) {
      get().removeBuilding(id);
    }
    localStorage.removeItem(WORLD_STORAGE_KEY);
  },
}));
