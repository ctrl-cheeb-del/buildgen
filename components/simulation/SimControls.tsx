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
          px-4 py-2 rounded-full text-xs font-mono font-bold
          bg-white/15 backdrop-blur-2xl border border-white/25
          shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_4px_16px_rgba(0,0,0,0.2)]
          transition-all
          ${loading ? "opacity-50 cursor-wait" : "cursor-pointer hover:bg-white/25"}
          ${isRunning ? "text-red-300" : "text-emerald-300"}
        `}
      >
        {loading ? "..." : isRunning ? "Stop Sim" : "Start Sim"}
      </button>
      {city && (
        <div className="text-[10px] text-white/40 font-mono mt-1.5 text-center">
          {isRunning ? `Tick ${city.totalTicks}` : "Paused"}
        </div>
      )}
    </div>
  );
}
