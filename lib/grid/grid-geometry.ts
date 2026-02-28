import {
  GRID_COLS,
  GRID_ROWS,
  PLOT_SIZE_M,
  ROAD_WIDTH_M,
  GRID_STEP_M,
} from "./grid-constants";

export interface PlotState {
  index: number;
  col: number;
  row: number;
  status: string;
  ownerId?: string;
  ownerName?: string;
  ownerUsername?: string;
  ownerAvatar?: string;
}

export function gridIndexToColRow(index: number): { col: number; row: number } {
  return { col: index % GRID_COLS, row: Math.floor(index / GRID_COLS) };
}

/** Grid total width/height in meters (centered on origin) */
function gridOffsets() {
  const totalW = GRID_COLS * PLOT_SIZE_M + (GRID_COLS + 1) * ROAD_WIDTH_M;
  const totalH = GRID_ROWS * PLOT_SIZE_M + (GRID_ROWS + 1) * ROAD_WIDTH_M;
  return { totalW, totalH, startX: -totalW / 2, startZ: -totalH / 2 };
}

/** Center of a plot cell in meters relative to city origin */
export function plotCenterMeters(col: number, row: number): [number, number] {
  const { startX, startZ } = gridOffsets();
  const x = startX + ROAD_WIDTH_M + col * GRID_STEP_M + PLOT_SIZE_M / 2;
  const z = startZ + ROAD_WIDTH_M + row * GRID_STEP_M + PLOT_SIZE_M / 2;
  return [x, z];
}

/** First empty plot index, or null if all full */
export function getNextEmptyPlot(plotStates: PlotState[]): number | null {
  const empty = plotStates.find((p) => p.status === "empty");
  return empty ? empty.index : null;
}
