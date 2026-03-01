"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useWorldStore } from "@/lib/stores/world-store";

interface Highlight {
  tick: number;
  headline: string;
  detail: string;
  type: "crisis" | "building" | "election" | "decree" | "milestone" | "drama";
}

const TYPE_COLORS: Record<string, string> = {
  crisis: "bg-red-400",
  building: "bg-emerald-400",
  election: "bg-amber-400",
  decree: "bg-blue-400",
  milestone: "bg-purple-400",
  drama: "bg-orange-400",
};

const TYPE_GLOW: Record<string, string> = {
  crisis: "shadow-[0_0_6px_rgba(248,113,113,0.5)]",
  building: "shadow-[0_0_6px_rgba(52,211,153,0.5)]",
  election: "shadow-[0_0_6px_rgba(251,191,36,0.5)]",
  decree: "shadow-[0_0_6px_rgba(96,165,250,0.5)]",
  milestone: "shadow-[0_0_6px_rgba(168,85,247,0.5)]",
  drama: "shadow-[0_0_6px_rgba(251,146,60,0.5)]",
};

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
  const summarize = useAction(api.simulation.replaySummary.summarizeReplay);

  const [playbackTick, setPlaybackTick] = useState(lastSeenTick);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [highlights, setHighlights] = useState<Highlight[] | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completedRef = useRef(false);
  const revealedIds = useRef(new Set<string>());
  const hiddenSetUp = useRef(false);
  const summaryRequested = useRef(false);

  const tickRange = currentTick - lastSeenTick;
  const progress =
    tickRange > 0 ? (playbackTick - lastSeenTick) / tickRange : 1;

  const { setReplayHiddenIds, revealBuilding } = useWorldStore();

  // Request AI summary on mount
  useEffect(() => {
    if (summaryRequested.current) return;
    summaryRequested.current = true;

    summarize({ afterTick: lastSeenTick, upToTick: currentTick })
      .then((result) => {
        setHighlights(result as Highlight[]);
        setSummaryLoading(false);
      })
      .catch((err) => {
        console.warn("[ReplayPlayback] Summary failed:", err);
        setSummaryLoading(false);
      });
  }, [summarize, lastSeenTick, currentTick]);

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

  // Count buildings that appeared so far during replay
  const buildingsAppeared =
    replay.buildings?.filter(
      (b) => b.createdAtTick != null && b.createdAtTick <= playbackTick,
    ).length ?? 0;

  return (
    <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center pointer-events-none animate-fade-in">
      <div
        className="w-[480px] rounded-2xl overflow-hidden pointer-events-auto backdrop-blur-2xl"
        style={{
          background: "rgba(0, 0, 0, 0.65)",
          border: "1px solid rgba(255, 255, 255, 0.2)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.15), 0 8px 32px rgba(0,0,0,0.4)",
        }}
      >
        {/* Inner gradient overlay */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white/[0.06] to-transparent pointer-events-none" />

        {/* AI Timeline */}
        <div className="relative px-4 py-3 max-h-44 overflow-y-auto scrollbar-hide">
          {summaryLoading ? (
            <div className="flex items-center gap-2 py-3 justify-center">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-[11px] text-white/40">Summarizing...</span>
            </div>
          ) : highlights && highlights.length > 0 ? (
            <div className="space-y-2.5">
              {highlights.map((h, i) => {
                const isActive = playbackTick >= h.tick;
                return (
                  <div
                    key={i}
                    className="flex items-start gap-2.5 transition-opacity duration-500"
                    style={{ opacity: isActive ? 1 : 0.3 }}
                  >
                    {/* Colored dot */}
                    <div className="flex flex-col items-center flex-shrink-0 pt-0.5">
                      <span
                        className={`w-2 h-2 rounded-full ${TYPE_COLORS[h.type] ?? "bg-white/40"} ${isActive ? TYPE_GLOW[h.type] ?? "" : ""}`}
                      />
                      {i < highlights.length - 1 && (
                        <div className="w-px h-4 bg-white/10 mt-1" />
                      )}
                    </div>
                    {/* Content */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] text-white/30 font-mono">
                          T{h.tick}
                        </span>
                        <span className="text-[11px] text-white/90 font-semibold truncate">
                          {h.headline}
                        </span>
                      </div>
                      <p className="text-[10px] text-white/50 leading-snug mt-0.5">
                        {h.detail}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-[11px] text-white/30 text-center py-2">
              Quiet period — nothing notable
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="relative px-4 pb-1">
          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-400 rounded-full transition-all duration-300"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>

        {/* Controls */}
        <div className="relative px-4 py-2.5 flex items-center justify-between border-t border-white/10">
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
                  className={`text-[10px] px-2 py-0.5 rounded-full font-mono transition-colors ${
                    speed === s
                      ? "border border-amber-400/50 bg-amber-500/20 text-amber-300"
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
