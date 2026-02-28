"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import type { MultiViewImages } from "@/lib/types";
import { api } from "../convex/_generated/api";
import ThreeMapCanvas from "@/components/ThreeMapCanvas";
import PromptBar from "@/components/PromptBar";
import StatusPanel from "@/components/StatusPanel";
import ImagePreview from "@/components/ImagePreview";
import CachedPreviewPicker from "@/components/CachedPreviewPicker";
import AuthButton from "@/components/AuthButton";
import CarModeButton from "@/components/CarModeButton";
import WalkModeButton from "@/components/fp/WalkModeButton";
import FirstPersonOverlay from "@/components/fp/FirstPersonOverlay";
import ControlPanel from "@/components/ControlPanel";
import PlotPopups from "@/components/PlotPopups";
import { useFPStore } from "@/lib/stores/fp-store";
import { usePipeline } from "@/lib/hooks/usePipeline";
import { useGridSync } from "@/lib/hooks/useGridSync";
import { useBuildingDrag } from "@/lib/hooks/useBuildingDrag";
import { useCarMode } from "@/lib/hooks/useCarMode";
import { useRemoteCars } from "@/lib/hooks/useRemoteCars";
import { useWorldStore } from "@/lib/stores/world-store";
import { GRID_COLS, GRID_ROWS } from "@/lib/grid/grid-constants";
import { gridIndexToColRow, plotCenterMeters } from "@/lib/grid/grid-geometry";
import type { Id } from "../convex/_generated/dataModel";

const TOTAL_PLOTS = GRID_COLS * GRID_ROWS;

export default function Home() {
  const { isRunning, multiView, steps, runPipeline } = usePipeline();
  const { isSignedIn, user } = useUser();
  const { plotStates, buildings, localPendingUpdates } =
    useGridSync();

  const myPlot = useQuery(api.plots.getMyPlot);
  const claimPlot = useMutation(api.plots.claimPlot);
  const convexUpdateTransform = useMutation(api.buildings.updateTransform);
  const releasePlot = useMutation(api.plots.releasePlot);

  const selectedId = useWorldStore((s) => s.selectedId);
  const selectBuilding = useWorldStore((s) => s.selectBuilding);
  const setConvexUpdateTransform = useWorldStore(
    (s) => s.setConvexUpdateTransform
  );
  const layer = useWorldStore((s) => s.layer);

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

  // Owned building IDs for drag system — stable reference via JSON key
  const ownedKey = myBuildings?.map((b) => b._id).join(",") ?? "";
  const ownedBuildingIds = useMemo(() => {
    const ids = new Set<string>();
    if (myBuildings) {
      for (const b of myBuildings) ids.add(b._id as string);
    }
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownedKey]);

  // Plot centers for each building in meter-space (for drag offset calculation)
  const buildingKeys = buildings?.map((b) => `${b._id}:${b.plotIndex}`).join(",") ?? "";
  const plotCenters = useMemo(() => {
    const centers = new Map<string, [number, number]>();
    if (buildings) {
      for (const b of buildings) {
        const { col, row } = gridIndexToColRow(b.plotIndex);
        const [mx, mz] = plotCenterMeters(col, row);
        centers.set(b._id as string, [mx, mz]);
      }
    }
    return centers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildingKeys]);

  // Wire up building drag system (pure Three.js raycasting)
  useBuildingDrag(layer, ownedBuildingIds, plotCenters);

  // Car mode
  const updateCarPosition = useMutation(api.cars.updateCarPosition);
  const removeCarPosition = useMutation(api.cars.removeCarPosition);
  const carUserId = user?.id ?? null;
  const carUserName = user?.username ?? "Anonymous";
  const carUserAvatar = user?.imageUrl;

  const handleCarSync = useCallback(
    (x: number, z: number, heading: number) => {
      if (!carUserId) return;
      updateCarPosition({ userId: carUserId, x, z, heading, userName: carUserName, userAvatar: carUserAvatar }).catch(() => {});
    },
    [carUserId, carUserName, carUserAvatar, updateCarPosition]
  );

  const handleCarExit = useCallback(() => {
    if (!carUserId) return;
    removeCarPosition({ userId: carUserId });
  }, [carUserId, removeCarPosition]);

  useCarMode(layer, handleCarSync, handleCarExit);
  useRemoteCars(carUserId);

  // First-person walk mode
  const fpMode = useFPStore((s) => s.fpMode);
  const setFPMode = useFPStore((s) => s.setFPMode);
  const setFPCharacter = useFPStore((s) => s.setCharacter);
  const handleWalkClick = useCallback(() => {
    const handle = user?.username ?? "Anonymous";
    setFPCharacter({ handle, avatarUrl: user?.imageUrl });
    setFPMode(true);
  }, [user, setFPCharacter, setFPMode]);

  // Map buildings data for FP scene
  const fpBuildings = useMemo(() => {
    if (!buildings) return [];
    return buildings.map((b) => ({
      _id: b._id as string,
      plotIndex: b.plotIndex,
      proceduralCode: b.proceduralCode,
      position: b.position ?? null,
      rotation: b.rotation ?? null,
      scale: b.scale ?? null,
    }));
  }, [buildings]);

  const isOwnerOfSelected = !!(
    selectedId &&
    myBuildings?.some((b) => (b._id as string) === selectedId)
  );

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <ThreeMapCanvas />

      {/* Plot click/hover popups */}
      <PlotPopups
        layer={layer}
        plotStates={plotStates}
        onPlotClick={handlePlotClick}
      />

      {/* Auth button + car/walk mode — top right */}
      {!fpMode && (
        <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-2">
          <AuthButton />
          <CarModeButton />
          <WalkModeButton onClick={handleWalkClick} />
        </div>
      )}

      {/* First-person overlay */}
      {fpMode && <FirstPersonOverlay buildings={fpBuildings} />}

      {/* Main panel */}
      {!fpMode && (
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
      )}
    </div>
  );
}
