"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type mapboxgl from "mapbox-gl";
import type { MultiViewImages } from "@/lib/types";
import { api } from "../convex/_generated/api";
import MapCanvas from "@/components/MapCanvas";
import PromptBar from "@/components/PromptBar";
import StatusPanel from "@/components/StatusPanel";
import ImagePreview from "@/components/ImagePreview";
import CachedPreviewPicker from "@/components/CachedPreviewPicker";
import AuthButton from "@/components/AuthButton";
import ControlPanel from "@/components/ControlPanel";
import { usePipeline } from "@/lib/hooks/usePipeline";
import { useGridSync } from "@/lib/hooks/useGridSync";
import { useWorldStore } from "@/lib/stores/world-store";
import { GRID_COLS, GRID_ROWS } from "@/lib/grid/grid-constants";
import type { Id } from "../convex/_generated/dataModel";

const TOTAL_PLOTS = GRID_COLS * GRID_ROWS;

export default function Home() {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const { isRunning, multiView, steps, runPipeline } = usePipeline();
  const { plotStates, gridGeoJSON, buildings, localPendingUpdates } =
    useGridSync();

  const myPlot = useQuery(api.plots.getMyPlot);
  const claimPlot = useMutation(api.plots.claimPlot);
  const convexUpdateTransform = useMutation(api.buildings.updateTransform);
  const deleteBuilding = useMutation(api.buildings.deleteBuilding);
  const releasePlot = useMutation(api.plots.releasePlot);

  const selectedId = useWorldStore((s) => s.selectedId);
  const selectBuilding = useWorldStore((s) => s.selectBuilding);
  const setConvexUpdateTransform = useWorldStore(
    (s) => s.setConvexUpdateTransform
  );

  // Wire up Convex transform sync
  useEffect(() => {
    setConvexUpdateTransform((buildingId, position, rotation, scale) => {
      localPendingUpdates.set(buildingId, Date.now());
      convexUpdateTransform({
        buildingId: buildingId as Id<"buildings">,
        position,
        rotation,
        scale,
      });
    });
  }, [setConvexUpdateTransform, convexUpdateTransform, localPendingUpdates]);

  const filledPlots = plotStates.filter(
    (p) => p.status === "occupied" || p.status === "claimed"
  ).length;

  const [cachedViews, setCachedViews] = useState<{
    views: MultiViewImages;
    buildingName: string;
  } | null>(null);

  const handleMapReady = useCallback((map: mapboxgl.Map) => {
    mapRef.current = map;
  }, []);

  const handleGenerate = useCallback(
    (buildingName: string) => {
      if (!myPlot) return;
      const cached = cachedViews?.views;
      runPipeline(buildingName, myPlot.index, cached);
    },
    [runPipeline, cachedViews, myPlot]
  );

  const handlePlotClick = useCallback(
    async (plotIndex: number) => {
      const plot = plotStates.find((p) => p.index === plotIndex);
      if (!plot) return;

      if (plot.status === "empty") {
        try {
          await claimPlot({ plotIndex });
        } catch (err) {
          console.error("Failed to claim plot:", err);
        }
      }
    },
    [plotStates, claimPlot]
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

  const handleDeleteBuilding = useCallback(
    async (buildingId: string) => {
      try {
        await deleteBuilding({ buildingId: buildingId as Id<"buildings"> });
      } catch (err) {
        console.error("Failed to delete building:", err);
      }
    },
    [deleteBuilding]
  );

  const handleReleasePlot = useCallback(async () => {
    if (!myPlot) return;
    try {
      await releasePlot({ plotIndex: myPlot.index });
    } catch (err) {
      console.error("Failed to release plot:", err);
    }
  }, [myPlot, releasePlot]);

  // Buildings on user's plot
  const myBuildings = buildings?.filter(
    (b) => myPlot && b.plotIndex === myPlot.index
  );

  const isOwnerOfSelected = !!(
    selectedId &&
    myBuildings?.some((b) => (b._id as string) === selectedId)
  );

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <MapCanvas
        gridGeoJSON={gridGeoJSON}
        onMapReady={handleMapReady}
        onPlotClick={handlePlotClick}
      />

      {/* Auth button — top right */}
      <div className="absolute top-4 right-4 z-10">
        <AuthButton />
      </div>

      {/* Main panel */}
      <div className="absolute top-4 left-4 z-10 bg-white/95 backdrop-blur-sm rounded-xl p-5 w-[340px] max-h-[calc(100vh-32px)] overflow-y-auto shadow-lg">
        <h1 className="text-lg font-bold text-gray-900 mb-3">City Builder</h1>

        {/* Plot status */}
        {myPlot ? (
          <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-xs text-blue-700">
                Your plot: <strong>#{myPlot.index}</strong> ({myPlot.status})
              </span>
              <button
                onClick={handleReleasePlot}
                className="text-xs text-red-500 hover:text-red-700"
              >
                Release
              </button>
            </div>
          </div>
        ) : (
          <div className="mb-3 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
            <span className="text-xs text-gray-500">
              Click an empty plot on the map to claim it.
            </span>
          </div>
        )}

        <PromptBar
          onGenerate={handleGenerate}
          isRunning={isRunning}
          overrideName={cachedViews?.buildingName}
          nextPlotIndex={myPlot?.index ?? null}
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

        {/* Building list for user's plot */}
        {myBuildings && myBuildings.length > 0 && (
          <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-600">
              Your Buildings ({myBuildings.length})
            </div>
            <div className="divide-y divide-gray-100">
              {myBuildings.map((b) => (
                <div
                  key={b._id}
                  className={`flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-gray-50 ${
                    selectedId === (b._id as string) ? "bg-blue-50" : ""
                  }`}
                  onClick={() => selectBuilding(b._id as string)}
                >
                  <span className="text-xs text-gray-700 truncate flex-1">
                    {b.prompt}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteBuilding(b._id as string);
                    }}
                    className="text-xs text-red-400 hover:text-red-600 ml-2"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transform controls */}
        {selectedId && (
          <div className="mt-3">
            <ControlPanel isOwner={isOwnerOfSelected} />
          </div>
        )}
      </div>
    </div>
  );
}
