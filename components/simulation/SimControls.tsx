"use client";

import { useQuery, useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";

export default function SimControls() {
  const city = useQuery(api.simulation.cityState.get);
  const [loading, setLoading] = useState(false);

  const handleStart = async () => {
    setLoading(true);
    try {
      await fetch("/api/simulation/start", { method: "POST" });
    } catch (e) {
      console.error("Failed to start simulation:", e);
    }
    setLoading(false);
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      await fetch("/api/simulation/stop", { method: "POST" });
    } catch (e) {
      console.error("Failed to stop simulation:", e);
    }
    setLoading(false);
  };

  const isRunning = city?.isRunning ?? false;

  return (
    <div className="absolute bottom-4 left-4 z-10">
      <button
        onClick={isRunning ? handleStop : handleStart}
        disabled={loading}
        className={`
          px-3 py-1.5 rounded-md text-xs font-mono font-bold
          backdrop-blur-sm transition-colors
          ${loading ? "opacity-50 cursor-wait" : "cursor-pointer"}
          ${isRunning
            ? "bg-red-500/80 hover:bg-red-600/80 text-white"
            : "bg-emerald-500/80 hover:bg-emerald-600/80 text-white"
          }
        `}
      >
        {loading ? "..." : isRunning ? "Stop Sim" : "Start Sim"}
      </button>
      {city && (
        <div className="text-[10px] text-zinc-400 font-mono mt-1 text-center">
          {isRunning ? `Tick ${city.totalTicks} running` : "Sim paused"}
        </div>
      )}
    </div>
  );
}
