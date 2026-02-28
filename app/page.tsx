"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import type { MultiViewImages, WorkbenchScreenshots } from "@/lib/types";
import { api } from "../convex/_generated/api";
import ThreeMapCanvas from "@/components/ThreeMapCanvas";
import AuthButton from "@/components/AuthButton";
import FirstPersonOverlay from "@/components/fp/FirstPersonOverlay";
import SettingsPanel from "@/components/SettingsPanel";
import ChatInput from "@/components/chat/ChatInput";
import ChatMessages from "@/components/chat/ChatMessages";
import PlotPopups from "@/components/PlotPopups";
import PipelineFlowchart, {
  PipelineSummaryPill,
} from "@/components/PipelineFlowchart";
import IsolatedViewer, {
  type IsolatedViewerHandle,
} from "@/components/workbench/IsolatedViewer";
import { useFPStore } from "@/lib/stores/fp-store";
import { useCarStore } from "@/lib/stores/car-store";
import { usePipeline } from "@/lib/hooks/usePipeline";
import { useIteration } from "@/lib/hooks/useIteration";
import { useGridSync } from "@/lib/hooks/useGridSync";
import { useBuildingDrag } from "@/lib/hooks/useBuildingDrag";
import { useCarMode } from "@/lib/hooks/useCarMode";
import { useRemoteCars } from "@/lib/hooks/useRemoteCars";
import { useChat } from "@/lib/hooks/useChat";
import { useChatStore } from "@/lib/stores/chat-store";
import { useWorldStore } from "@/lib/stores/world-store";
import { usePipelineStore } from "@/lib/stores/pipeline-store";
import { GRID_COLS, GRID_ROWS } from "@/lib/grid/grid-constants";
import { gridIndexToColRow, plotCenterMeters } from "@/lib/grid/grid-geometry";
import type { Id } from "../convex/_generated/dataModel";

const TOTAL_PLOTS = GRID_COLS * GRID_ROWS;

export default function Home() {
  const iterationViewerRef = useRef<IsolatedViewerHandle>(null);
  const { isRunning, multiView, sessionId, steps, runPipeline, iterationConfig } = usePipeline();
  const iteration = useIteration();
  const pipelineIsActive = usePipelineStore((s) => s.isActive);
  const pipelineIterationCount = usePipelineStore((s) => s.iterationCount);
  const { isSignedIn, user } = useUser();
  const { plotStates, buildings, localPendingUpdates } =
    useGridSync();

  const myPlot = useQuery(api.plots.getMyPlot);
  const claimPlot = useMutation(api.plots.claimPlot);
  const convexUpdateTransform = useMutation(api.buildings.updateTransform);
  const releasePlot = useMutation(api.plots.releasePlot);
  const deleteBuilding = useMutation(api.buildings.deleteBuilding);

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

  // Owned building IDs for drag system
  const ownedKey = myBuildings?.map((b) => b._id).join(",") ?? "";
  const ownedBuildingIds = useMemo(() => {
    const ids = new Set<string>();
    if (myBuildings) {
      for (const b of myBuildings) ids.add(b._id as string);
    }
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownedKey]);

  // Plot centers for each building
  const buildingKeys =
    buildings?.map((b) => `${b._id}:${b.plotIndex}`).join(",") ?? "";
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

  const setCarMode = useCarStore((s) => s.setCarMode);

  const handleCarSync = useCallback(
    (x: number, z: number, heading: number) => {
      if (!carUserId) return;
      updateCarPosition({
        userId: carUserId,
        x,
        z,
        heading,
        userName: carUserName,
        userAvatar: carUserAvatar,
      }).catch(() => {});
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

  // Chat
  const chatIsLoading = useChatStore((s) => s.isLoading);
  const addMessage = useChatStore((s) => s.addMessage);
  const removeStatusMessages = useChatStore((s) => s.removeStatusMessages);

  const prevIsRunning = useRef(false);
  useEffect(() => {
    if (prevIsRunning.current && !isRunning) {
      removeStatusMessages();
    }
    prevIsRunning.current = isRunning;
  }, [isRunning, removeStatusMessages]);

  const chatDeps = useMemo(
    () => ({
      setCarMode,
      setFPMode,
      setCharacter: setFPCharacter,
      runPipeline,
      myPlotIndex: myPlot?.index ?? null,
      userHandle: user?.username ?? "Anonymous",
      userAvatar: user?.imageUrl,
      addStatusMessage: (content: string, toolName: string) => {
        addMessage({ role: "status", content, toolName });
      },
    }),
    [
      setCarMode,
      setFPMode,
      setFPCharacter,
      runPipeline,
      myPlot?.index,
      user?.username,
      user?.imageUrl,
      addMessage,
    ]
  );

  const { sendMessage } = useChat(chatDeps);

  // --- Iteration auto-start ---
  const selectedBuilding = selectedId
    ? myBuildings?.find((b) => (b._id as string) === selectedId)
    : null;

  const generationComplete = steps.render?.state === "done";

  const captureScreenshotsForCode = useCallback(
    (code: string): WorkbenchScreenshots => {
      const viewer = iterationViewerRef.current;
      if (!viewer) throw new Error("Iteration viewer not mounted");
      viewer.loadCode(code);
      return viewer.captureAllViews();
    },
    []
  );

  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (
      generationComplete &&
      selectedBuilding &&
      sessionId &&
      !autoStartedRef.current &&
      !iteration.isIterating
    ) {
      autoStartedRef.current = true;
      iteration.startSession({
        sessionId,
        buildingId: selectedBuilding._id as string,
        initialCode: selectedBuilding.proceduralCode,
        captureScreenshots: captureScreenshotsForCode,
        maxIterations: iterationConfig?.maxIterations,
        qualityTarget: iterationConfig?.qualityTarget,
      });
    }
    if (isRunning) {
      autoStartedRef.current = false;
    }
  }, [
    generationComplete,
    selectedBuilding,
    sessionId,
    iteration,
    captureScreenshotsForCode,
    isRunning,
    iterationConfig,
  ]);

  // --- Bottom pipeline panel state ---
  const pipelineError = usePipelineStore((s) => s.error);
  const pipelineHasRun = pipelineIsActive || pipelineIterationCount > 0 || isRunning || !!pipelineError;
  const [isMinimized, setMinimized] = useState(false);

  // Auto-minimize when pipeline finishes (but NOT on error)
  const prevActiveRef = useRef(false);
  useEffect(() => {
    if (prevActiveRef.current && !pipelineIsActive && !isRunning && !pipelineError) {
      const t = setTimeout(() => setMinimized(true), 2000);
      return () => clearTimeout(t);
    }
    prevActiveRef.current = pipelineIsActive || isRunning;
  }, [pipelineIsActive, isRunning, pipelineError]);

  // Expand when pipeline starts
  useEffect(() => {
    if (pipelineIsActive || isRunning) {
      setMinimized(false);
    }
  }, [pipelineIsActive, isRunning]);

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <ThreeMapCanvas />

      {/* Plot click/hover popups */}
      <PlotPopups
        layer={layer}
        plotStates={plotStates}
        onPlotClick={handlePlotClick}
      />

      {/* Hidden IsolatedViewer for iteration screenshot capture */}
      <div
        className="absolute"
        style={{ left: -9999, top: -9999 }}
        aria-hidden="true"
      >
        <div style={{ width: 512, height: 512 }}>
          <IsolatedViewer ref={iterationViewerRef} />
        </div>
      </div>

      {/* Top-right: Auth + Settings gear */}
      {!fpMode && (
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
          <AuthButton />
          <SettingsPanel
            isRunning={isRunning}
            multiView={multiView}
            steps={steps}
            onGenerate={handleGenerate}
            myPlot={myPlot}
            totalPlots={TOTAL_PLOTS}
            filledPlots={filledPlots}
            onReleasePlot={handleReleasePlot}
            myBuildings={myBuildings?.map((b) => ({
              _id: b._id as string,
              prompt: b.prompt,
            }))}
            selectedId={selectedId}
            onSelectBuilding={selectBuilding}
            onDeleteBuilding={handleDeleteBuilding}
            isOwnerOfSelected={isOwnerOfSelected}
            cachedViews={cachedViews}
            onSelectCached={handleSelectCached}
            onClearCached={handleClearCached}
          />
        </div>
      )}

      {/* First-person overlay */}
      {fpMode && <FirstPersonOverlay buildings={fpBuildings} />}

      {/* Chat UI */}
      <ChatMessages />
      <ChatInput onSend={sendMessage} isLoading={chatIsLoading} />

      {/* Pipeline panel — top-right vertical glass */}
      {pipelineHasRun && !fpMode && (
        <div className="absolute top-16 right-4 z-10 max-h-[calc(100vh-5rem)] overflow-y-auto scrollbar-hide">
          {isMinimized ? (
            <PipelineSummaryPill onExpand={() => setMinimized(false)} />
          ) : (
            <PipelineFlowchart
              onMinimize={() => setMinimized(true)}
              onStop={iteration.stop}
              onTogglePause={iteration.togglePause}
            />
          )}
        </div>
      )}
    </div>
  );
}
