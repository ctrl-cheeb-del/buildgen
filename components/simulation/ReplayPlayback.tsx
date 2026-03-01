"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useWorldStore } from "@/lib/stores/world-store";
import { loadProceduralGeometry } from "@/lib/viewer/procedural-loader";
import { applyBuildingTextures } from "@/lib/viewer/building-textures";
import { gridIndexToColRow, plotCenterMeters } from "@/lib/grid/grid-geometry";

interface ReplayPlaybackProps {
  lastSeenTick: number;
  currentTick: number;
  onComplete: () => void;
}

export default function ReplayPlayback({
  lastSeenTick,
  currentTick,
  onComplete,
}: ReplayPlaybackProps) {
  const replay = useQuery(api.simulation.replay.getReplaySince, {
    afterTick: lastSeenTick,
  });
  const updateLastSeen = useMutation(api.plots.updateLastSeenTick);

  const [playbackTick, setPlaybackTick] = useState(lastSeenTick);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completedRef = useRef(false);
  const addedBuildingIds = useRef(new Set<string>());

  const tickRange = currentTick - lastSeenTick;
  const progress = tickRange > 0 ? (playbackTick - lastSeenTick) / tickRange : 1;

  // Playback timer
  useEffect(() => {
    if (!isPlaying) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    const ms = Math.max(200, 1000 / speed);
    intervalRef.current = setInterval(() => {
      setPlaybackTick((prev) => {
        if (prev >= currentTick) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, ms);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, speed, currentTick]);

  const handleComplete = useCallback(async () => {
    if (completedRef.current) return;
    completedRef.current = true;
    await updateLastSeen({ tick: currentTick });
    onComplete();
  }, [updateLastSeen, currentTick, onComplete]);

  // Auto-complete when playback finishes
  useEffect(() => {
    if (playbackTick >= currentTick && !isPlaying) {
      const t = setTimeout(handleComplete, 1500);
      return () => clearTimeout(t);
    }
  }, [playbackTick, currentTick, isPlaying, handleComplete]);

  // Visual timelapse: add buildings to the 3D scene as playback reaches their tick
  const { addBuilding, layer } = useWorldStore();
  useEffect(() => {
    if (!replay?.buildings || !layer) return;

    const newBuildings = replay.buildings.filter(
      (b) =>
        b.createdAtTick != null &&
        b.createdAtTick <= playbackTick &&
        !addedBuildingIds.current.has(b._id as string)
    );

    for (const b of newBuildings) {
      const id = b._id as string;
      addedBuildingIds.current.add(id);

      try {
        const group = loadProceduralGeometry(b.proceduralCode);
        applyBuildingTextures(group);

        const { col, row } = gridIndexToColRow(b.plotIndex);
        const [mx, mz] = plotCenterMeters(col, row);
        const offset: [number, number, number] = b.position
          ? [b.position.x, b.position.y, b.position.z]
          : [0, 0, 0];

        // Start at scale 0 for animation
        group.scale.set(0, 0, 0);

        addBuilding(
          {
            id,
            name: b.prompt,
            x: mx,
            z: mz,
            path: "A",
            scale: b.scale ?? 1,
            offset,
            rotation: b.rotation
              ? [b.rotation.x, b.rotation.y, b.rotation.z]
              : [0, 0, 0],
            visible: true,
            proceduralCode: b.proceduralCode,
          },
          group,
        );

        // Animate scale-up 0→1 over 500ms
        const container = useWorldStore.getState().containers.get(id);
        if (container) {
          const targetScale = b.scale ?? 1;
          const startTime = performance.now();
          const duration = 500;
          const animate = (now: number) => {
            const elapsed = now - startTime;
            const t = Math.min(1, elapsed / duration);
            // Ease-out cubic
            const eased = 1 - Math.pow(1 - t, 3);
            const s = eased * targetScale;
            container.scale.set(s, s, s);
            if (t < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        }
      } catch (err) {
        console.warn(`[ReplayPlayback] Failed to load building ${id}:`, err);
      }
    }
  }, [playbackTick, replay?.buildings, layer, addBuilding]);

  if (!replay) return null;

  // Get messages for current playback tick
  const currentMessages = replay.messages.filter(
    (m) => m.tickNumber === playbackTick
  );

  // Count buildings that appeared so far during replay
  const buildingsAppeared = replay.buildings?.filter(
    (b) => b.createdAtTick != null && b.createdAtTick <= playbackTick
  ).length ?? 0;

  return (
    <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center pointer-events-none">
      <div
        className="w-[480px] rounded-2xl overflow-hidden pointer-events-auto backdrop-blur-2xl"
        style={{
          background: "rgba(0, 0, 0, 0.7)",
          border: "1px solid rgba(255, 255, 255, 0.2)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}
      >
        {/* Current tick messages */}
        <div className="px-4 py-3 max-h-32 overflow-y-auto scrollbar-hide">
          {currentMessages.length > 0 ? (
            currentMessages.slice(0, 3).map((msg, i) => (
              <div key={i} className="flex items-start gap-2 mb-1.5">
                <span
                  className={`text-[10px] font-semibold flex-shrink-0 ${
                    msg.messageType === "announcement"
                      ? "text-amber-300"
                      : "text-white/60"
                  }`}
                >
                  {msg.senderName}
                </span>
                <span className="text-[11px] text-white/80">
                  {msg.content}
                </span>
              </div>
            ))
          ) : (
            <div className="text-[11px] text-white/30 text-center py-2">
              Tick {playbackTick} — quiet moment
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="px-4 pb-1">
          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-400 rounded-full transition-all duration-300"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>

        {/* Controls */}
        <div className="px-4 py-2.5 flex items-center justify-between border-t border-white/10">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="text-xs font-bold text-white/80 hover:text-white transition-colors"
            >
              {isPlaying ? "Pause" : "Play"}
            </button>
            <div className="flex gap-1">
              {[1, 2, 5].map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`text-[10px] px-1.5 py-0.5 rounded font-mono transition-colors ${
                    speed === s
                      ? "bg-amber-500/30 text-amber-300"
                      : "text-white/40 hover:text-white/70"
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {buildingsAppeared > 0 && (
              <span className="text-[10px] text-emerald-400/60 font-mono">
                +{buildingsAppeared} built
              </span>
            )}
            <span className="text-[10px] text-white/40 font-mono">
              T{playbackTick}/{currentTick}
            </span>
            <button
              onClick={handleComplete}
              className="text-[11px] font-bold text-white/50 hover:text-white/80 transition-colors"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
