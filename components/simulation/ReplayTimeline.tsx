"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRef } from "react";

interface ReplayTimelineProps {
  lastSeenTick: number;
  currentTick: number;
  onWatchReplay: () => void;
  onDismiss: () => void;
}

export default function ReplayTimeline({
  lastSeenTick,
  currentTick,
  onWatchReplay,
  onDismiss,
}: ReplayTimelineProps) {
  const replay = useQuery(api.simulation.replay.getReplaySince, {
    afterTick: lastSeenTick,
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const ticksMissed = currentTick - lastSeenTick;

  if (!replay) return null;
  if (replay.messages.length === 0 && replay.tickLogs.length === 0) return null;

  // Group messages by tick
  const tickGroups = new Map<
    number,
    Array<{ senderName: string; content: string; messageType: string }>
  >();
  for (const msg of replay.messages) {
    const list = tickGroups.get(msg.tickNumber) ?? [];
    list.push({
      senderName: msg.senderName,
      content: msg.content,
      messageType: msg.messageType,
    });
    tickGroups.set(msg.tickNumber, list);
  }

  const sortedTicks = [...tickGroups.keys()].sort((a, b) => a - b);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none animate-fade-in">
      <div
        className="w-96 rounded-2xl overflow-hidden pointer-events-auto backdrop-blur-2xl"
        style={{
          background: "rgba(255, 255, 255, 0.12)",
          border: "1px solid rgba(255, 255, 255, 0.25)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.3), 0 8px 32px rgba(0,0,0,0.2)",
        }}
      >
        {/* Inner gradient overlay */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white/[0.08] to-transparent pointer-events-none" />

        {/* Header */}
        <div className="relative px-4 py-3 flex items-center justify-between border-b border-white/15">
          <div>
            <h3 className="text-sm font-bold text-white">While you were away...</h3>
            <p className="text-[11px] text-white/40">
              {ticksMissed} tick{ticksMissed !== 1 ? "s" : ""} happened ·{" "}
              {replay.messages.length} events
            </p>
          </div>
          <button
            onClick={onDismiss}
            className="text-white/40 hover:text-white/80 transition-colors text-lg"
          >
            ×
          </button>
        </div>

        {/* Timeline content */}
        <div
          ref={scrollRef}
          className="relative max-h-64 overflow-y-auto scrollbar-hide px-4 py-3"
        >
          <div className="flex flex-col gap-3">
            {sortedTicks.slice(-20).map((tick) => (
              <div key={tick}>
                <div className="text-[9px] text-white/30 font-mono mb-1">
                  Tick {tick}
                </div>
                {tickGroups.get(tick)?.map((msg, i) => (
                  <div
                    key={i}
                    className="ml-3 mb-1 flex items-start gap-2"
                  >
                    <div
                      className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                        msg.messageType === "announcement"
                          ? "bg-amber-400"
                          : msg.messageType === "protest"
                            ? "bg-red-400"
                            : msg.messageType === "build_request"
                              ? "bg-emerald-400"
                              : "bg-white/40"
                      }`}
                    />
                    <div>
                      <span className="text-[10px] text-white/50 font-semibold">
                        {msg.senderName}
                      </span>
                      <p className="text-[11px] text-white/80 leading-snug">
                        {msg.content}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="relative px-4 py-3 border-t border-white/15 flex items-center gap-2">
          <button
            onClick={onWatchReplay}
            className="flex-1 px-3 py-2 rounded-full text-xs font-bold text-white bg-amber-500/25 hover:bg-amber-500/40 border border-amber-400/30 transition-colors shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]"
          >
            Watch it happen
          </button>
          <button
            onClick={onDismiss}
            className="px-3 py-2 rounded-full text-xs font-bold text-white/60 hover:text-white/90 bg-white/10 hover:bg-white/20 transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
