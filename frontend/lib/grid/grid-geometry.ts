import mapboxgl from "mapbox-gl";
import {
  GRID_COLS,
  GRID_ROWS,
  PLOT_SIZE_M,
  ROAD_WIDTH_M,
  PAVEMENT_WIDTH_M,
  GRID_STEP_M,
  CITY_ORIGIN_LNG,
  CITY_ORIGIN_LAT,
  type PlotStatus,
} from "./grid-constants";

export interface PlotState {
  index: number;
  col: number;
  row: number;
  status: PlotStatus;
  ownerId?: string;
  ownerName?: string;
  ownerUsername?: string;
  ownerAvatar?: string;
}

/**
 * Convert a meter offset from the city origin into [lng, lat].
 * Uses the same MercatorCoordinate pattern from mapbox-layer.ts.
 */
function metersToLngLat(dx: number, dz: number): [number, number] {
  const originMerc = mapboxgl.MercatorCoordinate.fromLngLat(
    [CITY_ORIGIN_LNG, CITY_ORIGIN_LAT],
    0
  );
  const scale = originMerc.meterInMercatorCoordinateUnits();
  const merc = new mapboxgl.MercatorCoordinate(
    originMerc.x + dx * scale,
    originMerc.y + dz * scale,
    0
  );
  const lngLat = merc.toLngLat();
  return [lngLat.lng, lngLat.lat];
}

/** Grid total width/height in meters (centered on origin) */
function gridOffsets() {
  const totalW = GRID_COLS * PLOT_SIZE_M + (GRID_COLS + 1) * ROAD_WIDTH_M;
  const totalH = GRID_ROWS * PLOT_SIZE_M + (GRID_ROWS + 1) * ROAD_WIDTH_M;
  return { totalW, totalH, startX: -totalW / 2, startZ: -totalH / 2 };
}

export function gridIndexToColRow(index: number): { col: number; row: number } {
  return { col: index % GRID_COLS, row: Math.floor(index / GRID_COLS) };
}

/** Center of a plot cell in meters relative to city origin */
function plotCenterMeters(col: number, row: number): [number, number] {
  const { startX, startZ } = gridOffsets();
  const x = startX + ROAD_WIDTH_M + col * GRID_STEP_M + PLOT_SIZE_M / 2;
  const z = startZ + ROAD_WIDTH_M + row * GRID_STEP_M + PLOT_SIZE_M / 2;
  return [x, z];
}

/** Center of a plot in [lng, lat] */
export function getPlotCenter(col: number, row: number): [number, number] {
  const [mx, mz] = plotCenterMeters(col, row);
  return metersToLngLat(mx, mz);
}

/** Four corners of a plot in [lng, lat] */
export function getPlotCorners(
  col: number,
  row: number
): [[number, number], [number, number], [number, number], [number, number]] {
  const [cx, cz] = plotCenterMeters(col, row);
  const half = PLOT_SIZE_M / 2;
  return [
    metersToLngLat(cx - half, cz - half),
    metersToLngLat(cx + half, cz - half),
    metersToLngLat(cx + half, cz + half),
    metersToLngLat(cx - half, cz + half),
  ];
}

/** First empty plot index, or null if all full */
export function getNextEmptyPlot(plotStates: PlotState[]): number | null {
  const empty = plotStates.find((p) => p.status === "empty");
  return empty ? empty.index : null;
}

/** Build a rectangle polygon from meter-space bounds */
function rectPoly(
  x: number,
  z: number,
  w: number,
  h: number
): [number, number][] {
  return [
    metersToLngLat(x, z),
    metersToLngLat(x + w, z),
    metersToLngLat(x + w, z + h),
    metersToLngLat(x, z + h),
    metersToLngLat(x, z), // close ring
  ];
}

/** Generate full grid GeoJSON */
export function generateGridGeoJSON(
  plotStates: PlotState[]
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  const { totalW, totalH, startX, startZ } = gridOffsets();

  // --- Road strips ---
  // Horizontal roads (GRID_ROWS + 1 strips)
  for (let r = 0; r <= GRID_ROWS; r++) {
    const z = startZ + r * GRID_STEP_M;
    features.push({
      type: "Feature",
      properties: { layerType: "road" },
      geometry: {
        type: "Polygon",
        coordinates: [rectPoly(startX, z, totalW, ROAD_WIDTH_M)],
      },
    });
  }
  // Vertical roads (GRID_COLS + 1 strips)
  for (let c = 0; c <= GRID_COLS; c++) {
    const x = startX + c * GRID_STEP_M;
    features.push({
      type: "Feature",
      properties: { layerType: "road" },
      geometry: {
        type: "Polygon",
        coordinates: [rectPoly(x, startZ, ROAD_WIDTH_M, totalH)],
      },
    });
  }

  // --- Pavement strips around each plot ---
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const px = startX + ROAD_WIDTH_M + c * GRID_STEP_M;
      const pz = startZ + ROAD_WIDTH_M + r * GRID_STEP_M;
      const pw = PAVEMENT_WIDTH_M;

      // Top pavement
      features.push({
        type: "Feature",
        properties: { layerType: "pavement" },
        geometry: {
          type: "Polygon",
          coordinates: [rectPoly(px, pz, PLOT_SIZE_M, pw)],
        },
      });
      // Bottom pavement
      features.push({
        type: "Feature",
        properties: { layerType: "pavement" },
        geometry: {
          type: "Polygon",
          coordinates: [
            rectPoly(px, pz + PLOT_SIZE_M - pw, PLOT_SIZE_M, pw),
          ],
        },
      });
      // Left pavement
      features.push({
        type: "Feature",
        properties: { layerType: "pavement" },
        geometry: {
          type: "Polygon",
          coordinates: [rectPoly(px, pz, pw, PLOT_SIZE_M)],
        },
      });
      // Right pavement
      features.push({
        type: "Feature",
        properties: { layerType: "pavement" },
        geometry: {
          type: "Polygon",
          coordinates: [
            rectPoly(px + PLOT_SIZE_M - pw, pz, pw, PLOT_SIZE_M),
          ],
        },
      });
    }
  }

  // --- Plot fills ---
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const index = r * GRID_COLS + c;
      const state = plotStates.find((p) => p.index === index);
      const status = state?.status ?? "empty";

      const px = startX + ROAD_WIDTH_M + c * GRID_STEP_M + PAVEMENT_WIDTH_M;
      const pz = startZ + ROAD_WIDTH_M + r * GRID_STEP_M + PAVEMENT_WIDTH_M;
      const innerSize = PLOT_SIZE_M - 2 * PAVEMENT_WIDTH_M;

      const ownerName = state?.ownerName ?? "";
      const ownerUsername = state?.ownerUsername ?? "";
      const ownerAvatar = state?.ownerAvatar ?? "";

      features.push({
        type: "Feature",
        properties: {
          layerType: "plot",
          plotIndex: index,
          plotStatus: status,
          ownerName,
          ownerUsername,
          ownerAvatar,
        },
        geometry: {
          type: "Polygon",
          coordinates: [rectPoly(px, pz, innerSize, innerSize)],
        },
      });
    }
  }

  // --- Block outline ---
  features.push({
    type: "Feature",
    properties: { layerType: "outline" },
    geometry: {
      type: "Polygon",
      coordinates: [rectPoly(startX, startZ, totalW, totalH)],
    },
  });

  return { type: "FeatureCollection", features };
}
