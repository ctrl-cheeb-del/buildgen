import { create } from "zustand";

interface FPCharacter {
  handle: string;
  avatarUrl?: string;
}

interface FPStore {
  fpMode: boolean;
  character: FPCharacter | null;

  toggleFPMode: () => void;
  setFPMode: (on: boolean) => void;
  setCharacter: (c: FPCharacter | null) => void;
}

export const useFPStore = create<FPStore>((set, get) => ({
  fpMode: false,
  character: null,

  toggleFPMode: () => set({ fpMode: !get().fpMode }),
  setFPMode: (on) => set({ fpMode: on }),
  setCharacter: (c) => set({ character: c }),
}));
