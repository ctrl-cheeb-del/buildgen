import { create } from "zustand";
import type { ScoreBreakdown, IterationResult, WorkbenchScreenshots } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export type PipelineNodeId =
  | "generate-views" // multiview generation
  | "generate-code" // Bedrock geometry generation
  | "place-on-map" // save to Convex
  | "capture" // screenshot capture (loop)
  | "score" // Bedrock score (loop)
  | "improve" // apply improved code (loop)
  | "update"; // save to Convex (loop)

export type NodeStatus = "pending" | "active" | "done" | "error";

export interface PipelineNode {
  id: PipelineNodeId;
  label: string;
  status: NodeStatus;
  detail?: string;
}

interface PipelineStore {
  nodes: PipelineNode[];
  isActive: boolean;
  iterationCount: number;
  maxIterations: number;
  latestScore: ScoreBreakdown | null;
  iterations: IterationResult[];
  isPaused: boolean;
  error: string | null;
  currentScreenshots: WorkbenchScreenshots | null;
  // Actions
  setNodeStatus: (
    id: PipelineNodeId,
    status: NodeStatus,
    detail?: string
  ) => void;
  setIterationData: (
    count: number,
    score: ScoreBreakdown | null,
    iterations: IterationResult[]
  ) => void;
  reset: () => void;
  setPaused: (v: boolean) => void;
  setError: (e: string | null) => void;
  setActive: (v: boolean) => void;
  setMaxIterations: (n: number) => void;
  setCurrentScreenshots: (s: WorkbenchScreenshots | null) => void;
}

/* ------------------------------------------------------------------ */
/*  Default nodes                                                       */
/* ------------------------------------------------------------------ */

const DEFAULT_NODES: PipelineNode[] = [
  { id: "generate-views", label: "Generate Views", status: "pending" },
  { id: "generate-code", label: "Generate Code", status: "pending" },
  { id: "place-on-map", label: "Place on Map", status: "pending" },
  { id: "capture", label: "Capture", status: "pending" },
  { id: "score", label: "Score", status: "pending" },
  { id: "improve", label: "Improve", status: "pending" },
  { id: "update", label: "Update", status: "pending" },
];

/* ------------------------------------------------------------------ */
/*  Store                                                               */
/* ------------------------------------------------------------------ */

export const usePipelineStore = create<PipelineStore>((set) => ({
  nodes: DEFAULT_NODES.map((n) => ({ ...n })),
  isActive: false,
  iterationCount: 0,
  maxIterations: 10,
  latestScore: null,
  iterations: [],
  isPaused: false,
  error: null,
  currentScreenshots: null,

  setNodeStatus: (id, status, detail) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === id ? { ...n, status, detail } : n
      ),
    })),

  setIterationData: (count, score, iterations) =>
    set({ iterationCount: count, latestScore: score, iterations }),

  reset: () =>
    set({
      nodes: DEFAULT_NODES.map((n) => ({ ...n })),
      isActive: false,
      iterationCount: 0,
      latestScore: null,
      iterations: [],
      isPaused: false,
      error: null,
      currentScreenshots: null,
    }),

  setPaused: (v) => set({ isPaused: v }),
  setError: (e) => set({ error: e }),
  setActive: (v) => set({ isActive: v }),
  setMaxIterations: (n) => set({ maxIterations: n }),
  setCurrentScreenshots: (s) => set({ currentScreenshots: s }),
}));
