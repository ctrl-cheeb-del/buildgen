import mapboxgl from "mapbox-gl";

const ROAD_COLOR = "#374151";
const PAVEMENT_COLOR = "#d1d5db";
const OUTLINE_COLOR = "#9ca3af";

const PLOT_COLORS: Record<string, string> = {
  empty: "#f3f4f6",
  generating: "#fef3c7",
  complete: "#ecfdf5",
};

export function initGridLayers(
  map: mapboxgl.Map,
  gridGeoJSON: GeoJSON.FeatureCollection
) {
  // Single source for all grid features
  map.addSource("grid", {
    type: "geojson",
    data: gridGeoJSON,
  });

  // Road fills
  map.addLayer({
    id: "road-fills",
    type: "fill",
    source: "grid",
    filter: ["==", ["get", "layerType"], "road"],
    paint: {
      "fill-color": ROAD_COLOR,
      "fill-opacity": 0.9,
    },
  });

  // Pavement fills
  map.addLayer({
    id: "pavement-fills",
    type: "fill",
    source: "grid",
    filter: ["==", ["get", "layerType"], "pavement"],
    paint: {
      "fill-color": PAVEMENT_COLOR,
      "fill-opacity": 0.8,
    },
  });

  // Plot fills — data-driven color by status
  map.addLayer({
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
        "generating",
        PLOT_COLORS.generating,
        "complete",
        PLOT_COLORS.complete,
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
  });

  // Plot borders
  map.addLayer({
    id: "plot-borders",
    type: "line",
    source: "grid",
    filter: ["==", ["get", "layerType"], "plot"],
    paint: {
      "line-color": "#9ca3af",
      "line-width": 1,
      "line-dasharray": [2, 2],
    },
  });

  // Block outline
  map.addLayer({
    id: "grid-outline",
    type: "line",
    source: "grid",
    filter: ["==", ["get", "layerType"], "outline"],
    paint: {
      "line-color": OUTLINE_COLOR,
      "line-width": 2,
    },
  });
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
