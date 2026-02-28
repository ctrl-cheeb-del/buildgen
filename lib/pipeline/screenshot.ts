import type mapboxgl from "mapbox-gl";

/**
 * Capture the current Mapbox canvas as a PNG data URL.
 * Requires `preserveDrawingBuffer: true` on the Map constructor.
 */
export function captureScreenshot(map: mapboxgl.Map): string {
  const canvas = map.getCanvas();
  return canvas.toDataURL("image/png");
}
