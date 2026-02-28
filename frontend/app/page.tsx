"use client";

import { useCallback, useRef } from "react";
import type mapboxgl from "mapbox-gl";
import MapCanvas from "@/components/MapCanvas";
import PromptBar from "@/components/PromptBar";
import ControlPanel from "@/components/ControlPanel";
import StatusPanel from "@/components/StatusPanel";
import ImagePreview from "@/components/ImagePreview";
import { usePipeline } from "@/lib/hooks/usePipeline";

export default function Home() {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const { isRunning, multiView, steps, runPipeline } = usePipeline();

  const handleMapReady = useCallback((map: mapboxgl.Map) => {
    mapRef.current = map;
  }, []);

  const handleGenerate = useCallback(
    (buildingName: string, lng: number, lat: number) => {
      runPipeline(buildingName, lng, lat).then(() => {
        mapRef.current?.flyTo({
          center: [lng, lat],
          zoom: 17,
          pitch: 60,
        });
      });
    },
    [runPipeline]
  );

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <MapCanvas onMapReady={handleMapReady} />

      {/* Control panel */}
      <div className="absolute top-4 left-4 z-10 bg-white/95 backdrop-blur-sm rounded-xl p-5 w-[340px] max-h-[calc(100vh-32px)] overflow-y-auto shadow-lg">
        <h1 className="text-lg font-bold text-gray-900 mb-3">
          Building Generator
        </h1>

        <PromptBar onGenerate={handleGenerate} isRunning={isRunning} />

        <div className="mt-3">
          <ControlPanel />
        </div>

        <div className="mt-3">
          <StatusPanel steps={steps} />
        </div>

        <ImagePreview multiView={multiView} />
      </div>
    </div>
  );
}
