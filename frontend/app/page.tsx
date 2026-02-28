"use client";

import { useCallback, useRef, useState } from "react";
import type mapboxgl from "mapbox-gl";
import type { MultiViewImages } from "@/lib/types";
import MapCanvas from "@/components/MapCanvas";
import PromptBar from "@/components/PromptBar";
import StatusPanel from "@/components/StatusPanel";
import ImagePreview from "@/components/ImagePreview";
import CachedPreviewPicker from "@/components/CachedPreviewPicker";
import { usePipeline } from "@/lib/hooks/usePipeline";
import { useGridSync } from "@/lib/hooks/useGridSync";
import { getNextEmptyPlot } from "@/lib/grid/grid-geometry";
import { GRID_COLS, GRID_ROWS } from "@/lib/grid/grid-constants";

const TOTAL_PLOTS = GRID_COLS * GRID_ROWS;

export default function Home() {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const { isRunning, multiView, steps, runPipeline } = usePipeline();
  const { plotStates, gridGeoJSON } = useGridSync();

  const nextPlotIndex = getNextEmptyPlot(plotStates);
  const filledPlots = plotStates.filter((p) => p.status === "complete").length;

  const [cachedViews, setCachedViews] = useState<{
    views: MultiViewImages;
    buildingName: string;
  } | null>(null);

  const handleMapReady = useCallback((map: mapboxgl.Map) => {
    mapRef.current = map;
  }, []);

  const handleGenerate = useCallback(
    (buildingName: string) => {
      const cached = cachedViews?.views;
      runPipeline(buildingName, cached);
    },
    [runPipeline, cachedViews]
  );

  const handleSelectCached = useCallback(
    (views: MultiViewImages, buildingName: string) => {
      setCachedViews({ views, buildingName });
    },
    []
  );

  const handleClearCached = useCallback(() => {
    setCachedViews(null);
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <MapCanvas gridGeoJSON={gridGeoJSON} onMapReady={handleMapReady} />

      <div className="absolute top-4 left-4 z-10 bg-white/95 backdrop-blur-sm rounded-xl p-5 w-[340px] max-h-[calc(100vh-32px)] overflow-y-auto shadow-lg">
        <h1 className="text-lg font-bold text-gray-900 mb-3">
          City Builder
        </h1>

        <PromptBar
          onGenerate={handleGenerate}
          isRunning={isRunning}
          overrideName={cachedViews?.buildingName}
          nextPlotIndex={nextPlotIndex}
          totalPlots={TOTAL_PLOTS}
          filledPlots={filledPlots}
        />

        {cachedViews && (
          <div className="mt-2 flex items-center gap-2 px-2 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
            <span className="text-xs text-blue-700 flex-1 truncate">
              Using cached: <strong>{cachedViews.buildingName}</strong>
            </span>
            <button
              onClick={handleClearCached}
              className="text-xs text-blue-500 hover:text-blue-700 font-medium"
            >
              Clear
            </button>
          </div>
        )}

        <div className="mt-3">
          <CachedPreviewPicker
            onSelect={handleSelectCached}
            disabled={isRunning}
          />
        </div>

        <div className="mt-3">
          <StatusPanel steps={steps} />
        </div>

        <ImagePreview multiView={multiView} />
      </div>
    </div>
  );
}
