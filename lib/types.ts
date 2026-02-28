export interface MultiViewImages {
  front: string;
  right: string;
  back: string;
  left: string;
  gridUrl?: string;
}

export interface PipelineStatus {
  step: "multiview" | "generate" | "render";
  state: "idle" | "running" | "done" | "error";
  detail?: string;
}

export type ActivePath = "A" | "B";

export interface WorldBuilding {
  id: string;
  name: string;
  /** X position in meter-space (from city origin) */
  x: number;
  /** Z position in meter-space (from city origin) */
  z: number;
  path: ActivePath;
  scale: number;
  offset: [number, number, number];
  rotation: [number, number, number];
  visible: boolean;
  proceduralCode?: string;
  glbBase64?: string;
}

export interface WorldSaveFile {
  version: 1;
  name: string;
  savedAt: string;
  origin: [number, number];
  buildings: WorldBuilding[];
}

/* ------------------------------------------------------------------ */
/*  Iteration Workbench types                                          */
/* ------------------------------------------------------------------ */

export type CameraAngle =
  | "front"
  | "right"
  | "back"
  | "left"
  | "top"
  | "perspective";

export interface WorkbenchScreenshots {
  front: string; // data URL (JPEG)
  right: string;
  back: string;
  left: string;
}

export interface ScoreBreakdown {
  silhouette: number; // 0-10
  proportions: number;
  features: number;
  materials: number;
  totalScore: number; // 0-10 average
  summary: string;
}

export interface IterationResult {
  iteration: number;
  score: ScoreBreakdown;
  feedback: string;
  feedbackPrompt: string;
  code: string;
  screenshots: WorkbenchScreenshots;
  improved: boolean;
}
