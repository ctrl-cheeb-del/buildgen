import { create } from "zustand";
import type * as THREE from "three";
import type { PlaneState } from "../plane/plane-physics";

interface RemotePlane {
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  roll: number;
  userId: string;
  userName: string;
  userAvatar?: string;
}

interface PlaneStore {
  planeMode: boolean;
  planePosition: PlaneState;
  planeGroup: THREE.Group | null;
  remotePlanes: Map<string, RemotePlane>;

  togglePlaneMode: () => void;
  setPlaneMode: (on: boolean) => void;
  updatePosition: (pos: PlaneState) => void;
  setPlaneGroup: (group: THREE.Group | null) => void;
  setRemotePlanes: (planes: Map<string, RemotePlane>) => void;
}

export const usePlaneStore = create<PlaneStore>((set, get) => ({
  planeMode: false,
  planePosition: {
    x: 0, y: 0.5, z: 0,
    heading: 0, pitch: 0, roll: 0,
    speed: 0, grounded: true,
  },
  planeGroup: null,
  remotePlanes: new Map(),

  togglePlaneMode: () => set({ planeMode: !get().planeMode }),
  setPlaneMode: (on) => set({ planeMode: on }),
  updatePosition: (pos) => set({ planePosition: pos }),
  setPlaneGroup: (group) => set({ planeGroup: group }),
  setRemotePlanes: (planes) => set({ remotePlanes: planes }),
}));
