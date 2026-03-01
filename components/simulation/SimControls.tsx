"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function SimControls({
  simVisible,
  onToggleSimVisible,
}: {
  simVisible: boolean;
  onToggleSimVisible: () => void;
}) {
  const city = useQuery(api.simulation.cityState.get);
  const isRunning = city?.isRunning ?? false;

  return (
    <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2">
      {/* Always-visible status: tick count + running dot */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-2xl border border-white/20">
        <div
          className={`w-2 h-2 rounded-full flex-shrink-0 ${
            isRunning ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"
          }`}
        />
        <span className="text-[10px] text-white/50 font-mono">
          {city ? `Week ${Math.max(1, Math.ceil(city.totalTicks / 12))}` : "—"}
        </span>
      </div>

      {/* Show/Hide sim toggle */}
      <button
        onClick={onToggleSimVisible}
        className={`
          px-4 py-2 rounded-full text-xs font-mono font-bold
          bg-white/15 backdrop-blur-2xl border border-white/25
          shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_4px_16px_rgba(0,0,0,0.2)]
          cursor-pointer hover:bg-white/25 transition-all
          ${simVisible ? "text-amber-300" : "text-white/60"}
        `}
      >
        {simVisible ? "Hide Sim" : "Show Sim"}
      </button>
    </div>
  );
}
