export const GRID_COLS = 4;
export const GRID_ROWS = 5; // 4x5 = 20 plots
export const PLOT_SIZE_M = 30; // 30m x 30m building footprint
export const ROAD_WIDTH_M = 8; // 8m roads between plots
export const PAVEMENT_WIDTH_M = 3; // 3m sidewalks around plots
export const GRID_STEP_M = PLOT_SIZE_M + ROAD_WIDTH_M; // 38m center-to-center

// City origin — arbitrary point, doesn't matter since map is blank
export const CITY_ORIGIN_LNG = 0;
export const CITY_ORIGIN_LAT = 0;

export type PlotStatus = "empty" | "generating" | "complete";
