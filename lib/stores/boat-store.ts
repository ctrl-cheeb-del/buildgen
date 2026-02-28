import { create } from "zustand";
import type * as THREE from "three";
import type { BoatState } from "../boat/boat-physics";

interface RemoteBoat {
  x: number;
  z: number;
  heading: number;
  userId: string;
  userName: string;
  userAvatar?: string;
}

interface BoatStore {
  boatMode: boolean;
  boatPosition: BoatState;
  boatGroup: THREE.Group | null;
  remoteBoats: Map<string, RemoteBoat>;

  toggleBoatMode: () => void;
  setBoatMode: (on: boolean) => void;
  updatePosition: (pos: BoatState) => void;
  setBoatGroup: (group: THREE.Group | null) => void;
  setRemoteBoats: (boats: Map<string, RemoteBoat>) => void;
}

export const useBoatStore = create<BoatStore>((set, get) => ({
  boatMode: false,
  boatPosition: { x: 0, z: 0, heading: 0, speed: 0, velAngle: 0, drifting: false },
  boatGroup: null,
  remoteBoats: new Map(),

  toggleBoatMode: () => set({ boatMode: !get().boatMode }),
  setBoatMode: (on) => set({ boatMode: on }),
  updatePosition: (pos) => set({ boatPosition: pos }),
  setBoatGroup: (group) => set({ boatGroup: group }),
  setRemoteBoats: (boats) => set({ remoteBoats: boats }),
}));
