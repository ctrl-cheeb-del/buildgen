"use client";

import { useEffect, useRef, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { ThreeJSMapboxLayer } from "@/lib/viewer/mapbox-layer";
import { useWorldStore } from "@/lib/stores/world-store";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

interface MapCanvasProps {
  initialLng?: number;
  initialLat?: number;
  onMapReady?: (map: mapboxgl.Map) => void;
}

export default function MapCanvas({
  initialLng = -73.9857,
  initialLat = 40.7484,
  onMapReady,
}: MapCanvasProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const setLayer = useWorldStore((s) => s.setLayer);

  const initMap = useCallback(() => {
    if (!mapContainer.current || mapRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [initialLng, initialLat],
      zoom: 16,
      pitch: 60,
      bearing: -17,
      antialias: true,
      preserveDrawingBuffer: true,
    });

    mapRef.current = map;

    map.on("load", () => {
      // Add 3D buildings layer for context
      const layers = map.getStyle().layers;
      const labelLayer = layers?.find(
        (l) =>
          l.type === "symbol" &&
          (l.layout as { "text-field"?: string })?.["text-field"]
      );

      map.addLayer(
        {
          id: "3d-buildings",
          source: "composite",
          "source-layer": "building",
          filter: ["==", "extrude", "true"],
          type: "fill-extrusion",
          minzoom: 15,
          paint: {
            "fill-extrusion-color": "#ddd",
            "fill-extrusion-height": ["get", "height"],
            "fill-extrusion-base": ["get", "min_height"],
            "fill-extrusion-opacity": 0.5,
          },
        },
        labelLayer?.id
      );

      // Initialize Three.js layer
      const threeLayer = new ThreeJSMapboxLayer(
        "three-buildings",
        initialLng,
        initialLat
      );
      map.addLayer(threeLayer);
      setLayer(threeLayer);

      onMapReady?.(map);
    });
  }, [initialLng, initialLat, onMapReady, setLayer]);

  useEffect(() => {
    initMap();
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={mapContainer}
      style={{ position: "absolute", inset: 0 }}
    />
  );
}
