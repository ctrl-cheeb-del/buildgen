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
  onPlotClick?: (plotIndex: number) => void;
}

export default function MapCanvas({
  gridGeoJSON,
  onMapReady,
  onPlotClick,
}: MapCanvasProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const gridInitialized = useRef(false);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const setLayer = useWorldStore((s) => s.setLayer);
  const onPlotClickRef = useRef(onPlotClick);
  onPlotClickRef.current = onPlotClick;

  // Dismiss plot popups when dragging starts
  useEffect(() => {
    let wasDragging = false;
    const unsub = useWorldStore.subscribe((s) => {
      if (s.isDragging && !wasDragging) {
        popupRef.current?.remove();
      }
      wasDragging = s.isDragging;
    });
    return unsub;
  }, []);

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
            paint: { "background-color": "#87ceeb" },
          },
        ],
      },
      center: [CITY_ORIGIN_LNG, CITY_ORIGIN_LAT],
      zoom: 14.5,
      pitch: 50,
      bearing: -17,
      antialias: true,
      preserveDrawingBuffer: true,
    });

    mapRef.current = map;

    map.on("load", () => {
      const threeLayer = new ThreeJSMapboxLayer(
        "three-buildings",
        CITY_ORIGIN_LNG,
        CITY_ORIGIN_LAT
      );
      map.addLayer(threeLayer);
      setLayer(threeLayer);
      onMapReady?.(map);
    });

    // Click on a plot → show popup
    map.on("click", "plot-fills", (e) => {
      if (useWorldStore.getState().isDragging) return;
      const feature = e.features?.[0];
      if (!feature) return;
      const props = feature.properties ?? {};
      const plotIndex = props.plotIndex;
      const status = props.plotStatus;
      const ownerName = props.ownerName;
      const ownerUsername = props.ownerUsername;
      const ownerAvatar = props.ownerAvatar;
      if (plotIndex === undefined || plotIndex === null) return;

      popupRef.current?.remove();

      let html: string;
      if (status === "empty") {
        html = `
          <div style="text-align:center;padding:4px 0">
            <div style="font-size:12px;color:#6b7280;margin-bottom:6px">Plot #${plotIndex}</div>
            <button
              id="claim-btn"
              style="background:#3b82f6;color:white;border:none;padding:5px 16px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer"
            >Claim this plot</button>
          </div>`;
      } else if (ownerName) {
        const avatarHtml = ownerAvatar
          ? `<img src="${ownerAvatar}" style="width:32px;height:32px;border-radius:50%;margin:0 auto 6px" />`
          : "";
        const nameHtml = ownerUsername
          ? `<a href="https://x.com/${ownerUsername}" target="_blank" rel="noopener" style="font-size:13px;font-weight:600;color:#374151;text-decoration:none">${ownerName}</a>
             <div style="font-size:11px;color:#9ca3af">@${ownerUsername}</div>`
          : `<div style="font-size:13px;font-weight:600;color:#374151">${ownerName}</div>`;
        html = `
          <div style="text-align:center;padding:6px 0">
            ${avatarHtml}
            ${nameHtml}
            <div style="font-size:10px;color:#9ca3af;margin-top:4px">Plot #${plotIndex} &middot; ${status}</div>
          </div>`;
      } else {
        html = `
          <div style="text-align:center;padding:4px 0">
            <div style="font-size:12px;color:#9ca3af">Plot #${plotIndex} &middot; ${status}</div>
          </div>`;
      }

      const popup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: true,
        offset: 10,
        maxWidth: "220px",
      })
        .setLngLat(e.lngLat)
        .setHTML(html)
        .addTo(map);

      popupRef.current = popup;

      if (status === "empty") {
        setTimeout(() => {
          const btn = document.getElementById("claim-btn");
          if (btn) {
            btn.addEventListener("click", () => {
              onPlotClickRef.current?.(Number(plotIndex));
              popup.remove();
            });
          }
        }, 0);
      }
    });

    // Cursor + hover tooltip for empty plots
    const hoverPopup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 10,
      maxWidth: "160px",
    });

    map.on("mousemove", "plot-fills", (e) => {
      if (useWorldStore.getState().isDragging) {
        hoverPopup.remove();
        return;
      }
      const feature = e.features?.[0];
      if (!feature) return;
      const props = feature.properties ?? {};
      const status = props.plotStatus;
      const ownerName = props.ownerName;
      const ownerUsername = props.ownerUsername;
      const ownerAvatar = props.ownerAvatar;
      const plotIndex = props.plotIndex;

      if (status === "empty") {
        map.getCanvas().style.cursor = "pointer";
        hoverPopup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-size:11px;color:#6b7280;text-align:center">Plot #${plotIndex}<br><span style="color:#3b82f6;font-weight:600">Click to claim</span></div>`
          )
          .addTo(map);
      } else if (ownerName) {
        map.getCanvas().style.cursor = "pointer";
        const avatar = ownerAvatar
          ? `<img src="${ownerAvatar}" style="width:20px;height:20px;border-radius:50%;vertical-align:middle;margin-right:4px" />`
          : "";
        const display = ownerUsername ? `@${ownerUsername}` : ownerName;
        hoverPopup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-size:11px;text-align:center;display:flex;align-items:center;justify-content:center;gap:4px">${avatar}<span style="font-weight:600;color:#374151">${display}</span></div>`
          )
          .addTo(map);
      } else {
        map.getCanvas().style.cursor = "default";
        hoverPopup.remove();
      }
    });

    map.on("mouseleave", "plot-fills", () => {
      map.getCanvas().style.cursor = "";
      hoverPopup.remove();
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
