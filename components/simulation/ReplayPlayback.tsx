"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useWorldStore } from "@/lib/stores/world-store";

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
  const revealedIds = useRef(new Set<string>());
  const hiddenSetUp = useRef(false);

  const tickRange = currentTick - lastSeenTick;
  const progress = tickRange > 0 ? (playbackTick - lastSeenTick) / tickRange : 1;

  const { setReplayHiddenIds, revealBuilding } = useWorldStore();

  // On mount: hide all replay buildings so they can be revealed tick-by-tick
  useEffect(() => {
    if (!replay?.buildings || hiddenSetUp.current) return;
    hiddenSetUp.current = true;

    const ids = new Set(replay.buildings.map((b) => b._id as string));
    if (ids.size > 0) {
      setReplayHiddenIds(ids);
    }
  }, [replay?.buildings, setReplayHiddenIds]);

  // On unmount: unhide everything
  useEffect(() => {
    return () => {
      setReplayHiddenIds(new Set());
    };
  }, [setReplayHiddenIds]);

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
    // Reveal any remaining hidden buildings
    setReplayHiddenIds(new Set());
    await updateLastSeen({ tick: currentTick });
    onComplete();
  }, [updateLastSeen, currentTick, onComplete, setReplayHiddenIds]);

  // Auto-complete when playback finishes
  useEffect(() => {
    if (playbackTick >= currentTick && !isPlaying) {
      const t = setTimeout(handleComplete, 1500);
      return () => clearTimeout(t);
    }
  }, [playbackTick, currentTick, isPlaying, handleComplete]);

  // Reveal buildings as playbackTick advances past their createdAtTick
  useEffect(() => {
    if (!replay?.buildings) return;

    for (const b of replay.buildings) {
      const id = b._id as string;
      if (
        b.createdAtTick != null &&
        b.createdAtTick <= playbackTick &&
        !revealedIds.current.has(id)
      ) {
        revealedIds.current.add(id);
        revealBuilding(id);
      }
    }
  }, [playbackTick, replay?.buildings, revealBuilding]);

  if (!replay) return null;

  // Get messages for current playback tick
  const currentMessages = replay.messages.filter(
    (m) => m.tickNumber === playbackTick,
  );

  // Count buildings that appeared so far during replay
  const buildingsAppeared =
    replay.buildings?.filter(
      (b) => b.createdAtTick != null && b.createdAtTick <= playbackTick,
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
