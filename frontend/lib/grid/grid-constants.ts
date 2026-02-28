export const GRID_COLS = 8;
export const GRID_ROWS = 10; // 8x10 = 80 plots
export const PLOT_SIZE_M = 120; // 120m x 120m building footprint
export const ROAD_WIDTH_M = 16; // 16m roads between plots
export const PAVEMENT_WIDTH_M = 6; // 6m sidewalks around plots
export const GRID_STEP_M = PLOT_SIZE_M + ROAD_WIDTH_M; // 136m center-to-center
/** Half the grass (inner plot) area — edge of grass from plot center */
export const GRASS_HALF_M = (PLOT_SIZE_M - 2 * PAVEMENT_WIDTH_M) / 2; // 54m

// City origin — arbitrary point, doesn't matter since map is blank
export const CITY_ORIGIN_LNG = 0;
export const CITY_ORIGIN_LAT = 0;

export type PlotStatus = "empty" | "claimed" | "generating" | "occupied";
