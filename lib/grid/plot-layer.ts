import mapboxgl from "mapbox-gl";

const ROAD_COLOR = "#374151";
const PAVEMENT_COLOR = "#d1d5db";
const OUTLINE_COLOR = "#9ca3af";

const PLOT_COLORS: Record<string, string> = {
  empty: "#f3f4f6",
  claimed: "#dbeafe",
  generating: "#fef3c7",
  occupied: "#ecfdf5",
};

const THREE_LAYER_ID = "three-buildings";

export function initGridLayers(
  map: mapboxgl.Map,
  gridGeoJSON: GeoJSON.FeatureCollection
) {
  // Single source for all grid features
  map.addSource("grid", {
    type: "geojson",
    data: gridGeoJSON,
  });

  // Insert all 2D grid layers BEFORE the Three.js custom layer so that
  // 3D buildings always render on top of the flat ground plane.
  const beforeId = map.getLayer(THREE_LAYER_ID) ? THREE_LAYER_ID : undefined;

  // Road fills
  map.addLayer(
    {
      id: "road-fills",
      type: "fill",
      source: "grid",
      filter: ["==", ["get", "layerType"], "road"],
      paint: {
        "fill-color": ROAD_COLOR,
        "fill-opacity": 0.9,
      },
    },
    beforeId
  );

  // Pavement fills
  map.addLayer(
    {
      id: "pavement-fills",
      type: "fill",
      source: "grid",
      filter: ["==", ["get", "layerType"], "pavement"],
      paint: {
        "fill-color": PAVEMENT_COLOR,
        "fill-opacity": 0.8,
      },
    },
    beforeId
  );

  // Plot fills — data-driven color by status
  map.addLayer(
    {
      id: "plot-fills",
      type: "fill",
      source: "grid",
      filter: ["==", ["get", "layerType"], "plot"],
      paint: {
        "fill-color": [
          "match",
          ["get", "plotStatus"],
          "empty",
          PLOT_COLORS.empty,
          "claimed",
          PLOT_COLORS.claimed,
          "generating",
          PLOT_COLORS.generating,
          "occupied",
          PLOT_COLORS.occupied,
          PLOT_COLORS.empty,
        ],
        "fill-opacity": [
          "match",
          ["get", "plotStatus"],
          "generating",
          0.7,
          0.9,
        ],
      },
    },
    beforeId
  );

  // Plot borders
  map.addLayer(
    {
      id: "plot-borders",
      type: "line",
      source: "grid",
      filter: ["==", ["get", "layerType"], "plot"],
      paint: {
        "line-color": "#9ca3af",
        "line-width": 1,
        "line-dasharray": [2, 2],
      },
    },
    beforeId
  );

  // Block outline
  map.addLayer(
    {
      id: "grid-outline",
      type: "line",
      source: "grid",
      filter: ["==", ["get", "layerType"], "outline"],
      paint: {
        "line-color": OUTLINE_COLOR,
        "line-width": 2,
      },
    },
    beforeId
  );
}

export function updatePlotStates(
  map: mapboxgl.Map,
  gridGeoJSON: GeoJSON.FeatureCollection
) {
  const source = map.getSource("grid") as mapboxgl.GeoJSONSource | undefined;
  if (source) {
    source.setData(gridGeoJSON);
  }
}
