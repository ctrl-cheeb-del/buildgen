import { create } from "zustand";
import type * as THREE from "three";
import type { CarState } from "../car/car-physics";

interface RemoteCar {
  x: number;
  z: number;
  heading: number;
  userId: string;
  userName: string;
}

interface CarStore {
  carMode: boolean;
  carPosition: CarState;
  carGroup: THREE.Group | null;
  remoteCars: Map<string, RemoteCar>;

  toggleCarMode: () => void;
  setCarMode: (on: boolean) => void;
  updatePosition: (pos: CarState) => void;
  setCarGroup: (group: THREE.Group | null) => void;
  setRemoteCars: (cars: Map<string, RemoteCar>) => void;
}

export const useCarStore = create<CarStore>((set, get) => ({
  carMode: false,
  carPosition: { x: 0, z: 0, heading: 0, speed: 0, velAngle: 0, drifting: false },
  carGroup: null,
  remoteCars: new Map(),

  toggleCarMode: () => set({ carMode: !get().carMode }),
  setCarMode: (on) => set({ carMode: on }),
  updatePosition: (pos) => set({ carPosition: pos }),
  setCarGroup: (group) => set({ carGroup: group }),
  setRemoteCars: (cars) => set({ remoteCars: cars }),
}));
