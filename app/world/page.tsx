"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { api } from "../../convex/_generated/api";
import type { WorkbenchScreenshots } from "@/lib/types";
import ThreeMapCanvas from "@/components/ThreeMapCanvas";
import AuthButton from "@/components/AuthButton";
import FirstPersonOverlay from "@/components/fp/FirstPersonOverlay";
import SettingsPanel from "@/components/SettingsPanel";
import ChatInput from "@/components/chat/ChatInput";
import ChatMessages from "@/components/chat/ChatMessages";
import PlotPopups from "@/components/PlotPopups";
import VehicleNameTags from "@/components/VehicleNameTags";
import PipelineFlowchart from "@/components/PipelineFlowchart";
import IsolatedViewer, {
  type IsolatedViewerHandle,
} from "@/components/workbench/IsolatedViewer";
import MetricsBar from "@/components/simulation/MetricsBar";
import SimFeed from "@/components/simulation/SimFeed";
import AgentDetailPanel from "@/components/simulation/AgentDetailPanel";
import SimControls from "@/components/simulation/SimControls";
import ReplayTimeline from "@/components/simulation/ReplayTimeline";
import ReplayPlayback from "@/components/simulation/ReplayPlayback";
import { useFPStore } from "@/lib/stores/fp-store";
import { useCarStore } from "@/lib/stores/car-store";
import { useBoatStore } from "@/lib/stores/boat-store";
import { usePlaneStore } from "@/lib/stores/plane-store";
import { usePipeline } from "@/lib/hooks/usePipeline";
import { useIteration } from "@/lib/hooks/useIteration";
import { useGridSync } from "@/lib/hooks/useGridSync";
import { useBuildingDrag } from "@/lib/hooks/useBuildingDrag";
import { useCarMode } from "@/lib/hooks/useCarMode";
import { useRemoteCars } from "@/lib/hooks/useRemoteCars";
import { useBoatMode } from "@/lib/hooks/useBoatMode";
import { useRemoteBoats } from "@/lib/hooks/useRemoteBoats";
import { usePlaneMode } from "@/lib/hooks/usePlaneMode";
import { useRemotePlanes } from "@/lib/hooks/useRemotePlanes";
import { useChat } from "@/lib/hooks/useChat";
import { useTradeDock } from "@/lib/hooks/useTradeDock";
import { useChatStore } from "@/lib/stores/chat-store";
import { useWorldStore } from "@/lib/stores/world-store";
import { usePipelineStore } from "@/lib/stores/pipeline-store";
import { gridIndexToColRow, plotCenterMeters } from "@/lib/grid/grid-geometry";
import type { Id } from "../../convex/_generated/dataModel";

function VehicleControlsHUD({ carMode, boatMode, planeMode }: { carMode: boolean; boatMode: boolean; planeMode: boolean }) {
  const active = carMode || boatMode || planeMode;
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (active) {
      setVisible(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setVisible(false), 3000);
    } else {
      setVisible(false);
      if (timerRef.current) clearTimeout(timerRef.current);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [active, carMode, boatMode, planeMode]);

  if (!active) return null;

  return (
    <div
      className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none transition-opacity duration-700"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <div className="bg-black/60 backdrop-blur-md rounded-2xl px-8 py-5 text-white text-sm font-mono flex flex-col items-center gap-3">
        <div className="text-white/50 text-xs uppercase tracking-widest mb-1">
          {carMode ? "car" : boatMode ? "boat" : "plane"} controls
        </div>
        <div className="flex gap-5 items-center flex-wrap justify-center">
          {carMode && (
            <>
              <span><kbd className="bg-white/20 px-2 py-1 rounded text-white">W</kbd> gas</span>
              <span><kbd className="bg-white/20 px-2 py-1 rounded text-white">S</kbd> brake</span>
              <span><kbd className="bg-white/20 px-2 py-1 rounded text-white">A/D</kbd> steer</span>
              <span><kbd className="bg-white/20 px-2 py-1 rounded text-white">Space</kbd> drift</span>
            </>
          )}
          {boatMode && (
            <>
              <span><kbd className="bg-white/20 px-2 py-1 rounded text-white">W</kbd> throttle</span>
              <span><kbd className="bg-white/20 px-2 py-1 rounded text-white">S</kbd> brake</span>
              <span><kbd className="bg-white/20 px-2 py-1 rounded text-white">A/D</kbd> steer</span>
              <span><kbd className="bg-white/20 px-2 py-1 rounded text-white">Space</kbd> drift</span>
            </>
          )}
          {planeMode && (
            <>
              <span><kbd className="bg-white/20 px-2 py-1 rounded text-white">W</kbd> throttle</span>
              <span><kbd className="bg-white/20 px-2 py-1 rounded text-white">S</kbd> brake</span>
              <span><kbd className="bg-white/20 px-2 py-1 rounded text-white">A/D</kbd> roll</span>
              <span><kbd className="bg-white/20 px-2 py-1 rounded text-white">Space</kbd> up</span>
              <span><kbd className="bg-white/20 px-2 py-1 rounded text-white">Shift</kbd> down</span>
            </>
          )}
        </div>
        <div className="text-white/30 text-xs mt-1">
          <kbd className="bg-white/10 px-1.5 py-0.5 rounded">Esc</kbd> exit
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const iterationViewerRef = useRef<IsolatedViewerHandle>(null);
  const { isRunning, runPipeline } = usePipeline();
  const iteration = useIteration();
  const pipelineIsActive = usePipelineStore((s) => s.isActive);
  const pipelineIterationCount = usePipelineStore((s) => s.iterationCount);
  const { isSignedIn, user } = useUser();
  const { plotStates, buildings, localPendingUpdates } = useGridSync();

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

  // Derive generating state from Convex (persists across refresh) + local state (instant feedback)
  const isGenerating = isRunning || myPlot?.status === "generating";

  // --- Convex-driven pipeline-store sync ---
  const pipelineStep = myPlot?.pipelineStep;
  const plotStatus = myPlot?.status;
  const multiViewUrl = myPlot?.pipelineMultiViewUrl;
  const prevPlotStatus = useRef(plotStatus);
  const isInitialMount = useRef(true);

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

  // Sync Convex pipeline state → pipeline-store (drives flowchart UI)
  useEffect(() => {
    const { setNodeStatus, setActive } = usePipelineStore.getState();

    if (plotStatus === "generating") {
      setActive(true);
      const stepOrder = ["generating-views", "generating-code", "placing"];
      const nodeIds = ["generate-views", "generate-code", "place-on-map"] as const;
      const stepIdx = stepOrder.indexOf(pipelineStep ?? "");

      for (let i = 0; i < nodeIds.length; i++) {
        if (i < stepIdx) setNodeStatus(nodeIds[i], "done");
        else if (i === stepIdx) setNodeStatus(nodeIds[i], "active");
        else setNodeStatus(nodeIds[i], "pending");
      }
    } else if (plotStatus === "occupied" && prevPlotStatus.current === "generating") {
      // Generation just completed — mark initial steps done
      setNodeStatus("generate-views", "done");
      setNodeStatus("generate-code", "done");
      setNodeStatus("place-on-map", "done");

      // Auto-select the newest building on our plot for iteration
      if (myBuildings && myBuildings.length > 0) {
        const newest = myBuildings[myBuildings.length - 1];
        selectBuilding(newest._id as string);
      }
    } else if (isInitialMount.current && plotStatus === "occupied" && multiViewUrl) {
      // Page refresh — plot is occupied with multiViewUrl, mark gen steps as done
      setNodeStatus("generate-views", "done");
      setNodeStatus("generate-code", "done");
      setNodeStatus("place-on-map", "done");
    }

    isInitialMount.current = false;
    prevPlotStatus.current = plotStatus;
  }, [pipelineStep, plotStatus, myBuildings, selectBuilding, multiViewUrl]);

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

  // Boat mode
  const updateBoatPosition = useMutation(api.boats.updateBoatPosition);
  const removeBoatPosition = useMutation(api.boats.removeBoatPosition);
  const setBoatMode = useBoatStore((s) => s.setBoatMode);

  const handleBoatSync = useCallback(
    (x: number, z: number, heading: number) => {
      if (!carUserId) return;
      updateBoatPosition({
        userId: carUserId,
        x,
        z,
        heading,
        userName: carUserName,
        userAvatar: carUserAvatar,
      }).catch(() => {});
    },
    [carUserId, carUserName, carUserAvatar, updateBoatPosition]
  );

  const handleBoatExit = useCallback(() => {
    if (!carUserId) return;
    removeBoatPosition({ userId: carUserId });
  }, [carUserId, removeBoatPosition]);

  useBoatMode(layer, handleBoatSync, handleBoatExit);
  useRemoteBoats(carUserId);

  // Plane mode
  const updatePlanePosition = useMutation(api.planes.updatePlanePosition);
  const removePlanePosition = useMutation(api.planes.removePlanePosition);
  const setPlaneMode = usePlaneStore((s) => s.setPlaneMode);

  const handlePlaneSync = useCallback(
    (x: number, y: number, z: number, heading: number, pitch: number, roll: number) => {
      if (!carUserId) return;
      updatePlanePosition({
        userId: carUserId,
        x, y, z,
        heading, pitch, roll,
        userName: carUserName,
        userAvatar: carUserAvatar,
      }).catch(() => {});
    },
    [carUserId, carUserName, carUserAvatar, updatePlanePosition]
  );

  const handlePlaneExit = useCallback(() => {
    if (!carUserId) return;
    removePlanePosition({ userId: carUserId });
  }, [carUserId, removePlanePosition]);

  usePlaneMode(layer, handlePlaneSync, handlePlaneExit);
  useRemotePlanes(carUserId);

  // Trade dock visual
  useTradeDock(layer);

  // Clean up all vehicle positions on tab close / navigate away
  useEffect(() => {
    const cleanup = () => {
      if (!carUserId) return;
      if (useCarStore.getState().carMode) {
        removeCarPosition({ userId: carUserId });
      }
      if (useBoatStore.getState().boatMode) {
        removeBoatPosition({ userId: carUserId });
      }
      if (usePlaneStore.getState().planeMode) {
        removePlanePosition({ userId: carUserId });
      }
    };
    window.addEventListener("beforeunload", cleanup);
    return () => {
      window.removeEventListener("beforeunload", cleanup);
      cleanup();
    };
  }, [carUserId, removeCarPosition, removeBoatPosition, removePlanePosition]);

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

  // Clear status messages when generation finishes
  const prevIsGenerating = useRef(false);
  useEffect(() => {
    if (prevIsGenerating.current && !isGenerating) {
      removeStatusMessages();
    }
    prevIsGenerating.current = isGenerating;
  }, [isGenerating, removeStatusMessages]);

  const chatDeps = useMemo(
    () => ({
      setCarMode,
      setBoatMode,
      setPlaneMode,
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
      setBoatMode,
      setPlaneMode,
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

  const captureScreenshotsForCode = useCallback(
    (code: string): WorkbenchScreenshots => {
      const viewer = iterationViewerRef.current;
      if (!viewer) throw new Error("Iteration viewer not mounted");
      viewer.loadCode(code);
      return viewer.captureAllViews();
    },
    []
  );

  // Auto-start iteration when generation completes (if a building exists)
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (
      plotStatus === "occupied" &&
      selectedBuilding &&
      !autoStartedRef.current &&
      !iteration.isIterating
    ) {
      // Only auto-start once — check if the building was just generated
      const genNodes = usePipelineStore.getState().nodes.slice(0, 3);
      const allGenDone = genNodes.every((n) => n.status === "done");
      if (allGenDone && multiViewUrl) {
        autoStartedRef.current = true;
        // Create a session for iteration using grid URL from Convex storage
        fetch("/api/iterate/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            buildingName: selectedBuilding.prompt,
            gridUrl: multiViewUrl,
          }),
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.sessionId) {
              const storeMax = usePipelineStore.getState().maxIterations;
              iteration.startSession({
                sessionId: data.sessionId,
                buildingId: selectedBuilding._id as string,
                initialCode: selectedBuilding.proceduralCode,
                captureScreenshots: captureScreenshotsForCode,
                maxIterations: storeMax,
              });
            }
          })
          .catch((err) => console.warn("[Iteration] Failed to create session:", err));
      }
    }
    if (isRunning) {
      autoStartedRef.current = false;
    }
  }, [
    plotStatus,
    selectedBuilding,
    iteration,
    captureScreenshotsForCode,
    isRunning,
    multiViewUrl,
  ]);

  // Cancel iteration if the building being iterated on is deleted
  useEffect(() => {
    if (iteration.isIterating && iteration.buildingId && buildings) {
      const stillExists = buildings.some(
        (b) => (b._id as string) === iteration.buildingId
      );
      if (!stillExists) {
        console.log("[Iteration] Building deleted, stopping iteration");
        iteration.stop();
      }
    }
  }, [buildings, iteration]);

  // --- Pipeline panel state ---
  const pipelineError = usePipelineStore((s) => s.error);
  const pipelineHasRun =
    pipelineIsActive ||
    pipelineIterationCount > 0 ||
    isRunning ||
    iteration.isIterating ||
    plotStatus === "generating" ||
    !!multiViewUrl ||
    !!pipelineError;
  const [isMinimized, setMinimized] = useState(false);

  // Auto-minimize when pipeline finishes (but NOT on error)
  const prevActiveRef = useRef(false);
  useEffect(() => {
    if (
      prevActiveRef.current &&
      !pipelineIsActive &&
      !isRunning &&
      !pipelineError
    ) {
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

  // Vehicle mode reads for HUD
  const carMode = useCarStore((s) => s.carMode);
  const boatMode = useBoatStore((s) => s.boatMode);
  const planeMode = usePlaneStore((s) => s.planeMode);

  // Agent detail panel
  const [selectedAgentPlot, setSelectedAgentPlot] = useState<number | null>(null);

  // Fly camera to agent's plot when clicking in feed
  const handleAgentClick = useCallback(
    (plotIndex: number) => {
      if (!layer) return;
      const { col, row } = gridIndexToColRow(plotIndex);
      const [mx, mz] = plotCenterMeters(col, row);
      layer.flyTo(mx, mz);
    },
    [layer]
  );

  // Sim visibility toggle (sim always runs, just show/hide UI)
  const [simVisible, setSimVisible] = useState(true);

  // Replay state
  const city = useQuery(api.simulation.cityState.get);
  const liveLastSeenTick = myPlot?.lastSeenTick ?? 0;
  const currentTick = city?.totalTicks ?? 0;
  const [replayDismissed, setReplayDismissed] = useState(false);
  const [watchingReplay, setWatchingReplay] = useState(false);
  const updateLastSeenTick = useMutation(api.plots.updateLastSeenTick);

  // Snapshot lastSeenTick on first load to prevent the updateLastSeenTick
  // effect from overwriting it before the replay UI can render.
  const initialLastSeenTickRef = useRef<number | null>(null);
  if (initialLastSeenTickRef.current === null && liveLastSeenTick > 0) {
    initialLastSeenTickRef.current = liveLastSeenTick;
  }
  const snapshotLastSeenTick = initialLastSeenTickRef.current ?? 0;
  const showReplay = isSignedIn && snapshotLastSeenTick > 0 && currentTick > snapshotLastSeenTick + 2;

  // Sim mode switching: live when authenticated user is on page.
  // Uses setTimeout(0) in cleanup to guard against React strict-mode:
  // strict mode synchronously unmounts+remounts, so the re-mount cancels
  // the pending overnight switch, keeping the sim in "live" mode.
  const setSimMode = useMutation(api.simulation.control.setSimMode);
  const simModeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (simModeTimeoutRef.current !== null) {
      clearTimeout(simModeTimeoutRef.current);
      simModeTimeoutRef.current = null;
    }
    if (isSignedIn) {
      setSimMode({ mode: "live" }).catch(() => {});
    }
    return () => {
      simModeTimeoutRef.current = setTimeout(() => {
        if (isSignedIn) {
          setSimMode({ mode: "overnight" }).catch(() => {});
        }
      }, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  // Persist lastSeenTick periodically while user is on page.
  // Skip while replay is pending so the snapshot isn't overwritten.
  const lastSavedTickRef = useRef(0);
  useEffect(() => {
    if (showReplay && !replayDismissed) return;
    if (currentTick > 0 && currentTick > lastSavedTickRef.current) {
      lastSavedTickRef.current = currentTick;
      updateLastSeenTick({ tick: currentTick }).catch(() => {});
    }
  }, [currentTick, updateLastSeenTick, showReplay, replayDismissed]);

  const handleReplayDismiss = useCallback(async () => {
    setReplayDismissed(true);
    setWatchingReplay(false);
    // Reset the snapshot so future page returns can detect new ticks
    initialLastSeenTickRef.current = null;
    if (currentTick > 0) {
      await updateLastSeenTick({ tick: currentTick });
    }
  }, [currentTick, updateLastSeenTick]);

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <ThreeMapCanvas />

      {/* Plot click/hover popups */}
      <PlotPopups
        layer={layer}
        plotStates={plotStates}
        onPlotClick={handlePlotClick}
      />

      {/* Floating name tags above remote vehicles */}
      <VehicleNameTags />

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

      {/* Simulation UI — always-visible controls + togglable details */}
      {!fpMode && (
        <SimControls
          simVisible={simVisible}
          onToggleSimVisible={() => setSimVisible((v) => !v)}
        />
      )}
      {!fpMode && simVisible && <MetricsBar />}
      {!fpMode && simVisible && <SimFeed onAgentClick={handleAgentClick} />}
      {simVisible && selectedAgentPlot !== null && (
        <AgentDetailPanel
          plotIndex={selectedAgentPlot}
          onClose={() => setSelectedAgentPlot(null)}
        />
      )}

      {/* Replay system */}
      {showReplay && !replayDismissed && !watchingReplay && (
        <ReplayTimeline
          lastSeenTick={snapshotLastSeenTick}
          currentTick={currentTick}
          onWatchReplay={() => setWatchingReplay(true)}
          onDismiss={handleReplayDismiss}
        />
      )}
      {watchingReplay && (
        <ReplayPlayback
          lastSeenTick={snapshotLastSeenTick}
          currentTick={currentTick}
          onComplete={handleReplayDismiss}
        />
      )}

      {/* Top-right: Auth + Settings gear */}
      {!fpMode && (
        <div className="absolute top-4 right-4 z-40 flex items-center gap-2">
          <AuthButton />
          <SettingsPanel
            isRunning={isGenerating}
            myPlot={myPlot}
            onReleasePlot={handleReleasePlot}
            myBuildings={myBuildings?.map((b) => ({
              _id: b._id as string,
              prompt: b.prompt,
            }))}
            selectedId={selectedId}
            onSelectBuilding={selectBuilding}
            onDeleteBuilding={handleDeleteBuilding}
            isOwnerOfSelected={isOwnerOfSelected}
          />
        </div>
      )}

      {/* Vehicle controls HUD — fades out after 3s */}
      <VehicleControlsHUD carMode={carMode} boatMode={boatMode} planeMode={planeMode} />

      {/* First-person overlay */}
      {fpMode && <FirstPersonOverlay buildings={fpBuildings} />}

      {/* Chat UI */}
      <ChatMessages />
      <ChatInput
        onSend={sendMessage}
        isLoading={chatIsLoading}
        isGenerating={isGenerating}
      />

      {/* Pipeline panel — top-left individual glass pills */}
      {pipelineHasRun && !fpMode && (
        <div className="absolute top-4 left-4 z-10">
          <PipelineFlowchart
            isMinimized={isMinimized}
            onToggleMinimize={() => setMinimized((v) => !v)}
            onStop={iteration.stop}
            onTogglePause={iteration.togglePause}
            multiViewUrl={multiViewUrl ?? null}
            iterations={iteration.iterations}
            selectedBuilding={
              selectedBuilding
                ? {
                    proceduralCode: selectedBuilding.proceduralCode,
                    prompt: selectedBuilding.prompt,
                    plotIndex: selectedBuilding.plotIndex,
                  }
                : null
            }
          />
        </div>
      )}
    </div>
  );
}
