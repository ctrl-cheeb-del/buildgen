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
  lng: number;
  lat: number;
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
