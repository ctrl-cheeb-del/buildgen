"use client";

import { useEffect, useRef, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { ThreeJSMapboxLayer } from "@/lib/viewer/mapbox-layer";
import { useWorldStore } from "@/lib/stores/world-store";
import { CITY_ORIGIN_LNG, CITY_ORIGIN_LAT } from "@/lib/grid/grid-constants";
import { initGridLayers, updatePlotStates } from "@/lib/grid/plot-layer";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

interface MapCanvasProps {
  gridGeoJSON?: GeoJSON.FeatureCollection | null;
  onMapReady?: (map: mapboxgl.Map) => void;
}

export default function MapCanvas({ gridGeoJSON, onMapReady }: MapCanvasProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const gridInitialized = useRef(false);
  const setLayer = useWorldStore((s) => s.setLayer);

  const initMap = useCallback(() => {
    if (!mapContainer.current || mapRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        name: "Blank",
        sources: {},
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#1f2937" },
          },
        ],
      },
      center: [CITY_ORIGIN_LNG, CITY_ORIGIN_LAT],
      zoom: 17,
      pitch: 50,
      bearing: -17,
      antialias: true,
      preserveDrawingBuffer: true,
    });

    mapRef.current = map;

    map.on("load", () => {
      // Initialize Three.js layer
      const threeLayer = new ThreeJSMapboxLayer(
        "three-buildings",
        CITY_ORIGIN_LNG,
        CITY_ORIGIN_LAT
      );
      map.addLayer(threeLayer);
      setLayer(threeLayer);

      onMapReady?.(map);
    });
  }, [onMapReady, setLayer]);

  useEffect(() => {
    initMap();
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      gridInitialized.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update grid GeoJSON when plot states change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !gridGeoJSON) return;

    const applyGrid = () => {
      if (!gridInitialized.current) {
        initGridLayers(map, gridGeoJSON);
        gridInitialized.current = true;
      } else {
        updatePlotStates(map, gridGeoJSON);
      }
    };

    if (map.isStyleLoaded()) {
      applyGrid();
    } else {
      map.once("load", applyGrid);
    }
  }, [gridGeoJSON]);

  return (
    <div
      ref={mapContainer}
      style={{ position: "absolute", inset: 0 }}
    />
  );
}
