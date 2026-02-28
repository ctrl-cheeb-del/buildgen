export const GRID_COLS = 8;
export const GRID_ROWS = 10; // 8x10 = 80 plots
export const PLOT_SIZE_M = 60; // 60m x 60m building footprint
export const ROAD_WIDTH_M = 12; // 12m roads between plots
export const PAVEMENT_WIDTH_M = 4; // 4m sidewalks around plots
export const GRID_STEP_M = PLOT_SIZE_M + ROAD_WIDTH_M; // 72m center-to-center

// City origin — arbitrary point, doesn't matter since map is blank
export const CITY_ORIGIN_LNG = 0;
export const CITY_ORIGIN_LAT = 0;

export type PlotStatus = "empty" | "claimed" | "generating" | "occupied";
