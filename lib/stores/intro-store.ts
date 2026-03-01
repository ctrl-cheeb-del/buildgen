import { create } from "zustand";

type IntroPhase = "loading" | "revealing" | "done";

interface IntroState {
  phase: IntroPhase;
  initialBuildingIds: string[];
  setPhase: (phase: IntroPhase) => void;
  setInitialBuildingIds: (ids: string[]) => void;
}

export const useIntroStore = create<IntroState>((set) => ({
  phase: "loading",
  initialBuildingIds: [],
  setPhase: (phase) => set({ phase }),
  setInitialBuildingIds: (ids) => set({ initialBuildingIds: ids }),
}));
