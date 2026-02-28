"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

function badge(
  label: string,
  value: number | string,
  thresholds?: { green: number; yellow: number; invert?: boolean }
) {
  let color = "bg-zinc-700 text-zinc-200";
  if (thresholds && typeof value === "number") {
    if (thresholds.invert) {
      // Lower is better (e.g. crime)
      if (value <= thresholds.yellow) color = "bg-emerald-600/80 text-white";
      else if (value <= thresholds.green) color = "bg-amber-500/80 text-white";
      else color = "bg-red-500/80 text-white";
    } else {
      if (value >= thresholds.green) color = "bg-emerald-600/80 text-white";
      else if (value >= thresholds.yellow) color = "bg-amber-500/80 text-white";
      else color = "bg-red-500/80 text-white";
    }
  }
  return (
    <div
      className={`${color} px-2.5 py-1 rounded-md text-xs font-mono flex items-center gap-1.5 backdrop-blur-sm`}
    >
      <span className="text-[10px] uppercase opacity-70">{label}</span>
      <span className="font-bold">{typeof value === "number" ? Math.round(value) : value}</span>
    </div>
  );
}

export default function MetricsBar() {
  const city = useQuery(api.simulation.cityState.get);

  if (!city) return null;

  return (
    <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5 pointer-events-auto">
      {badge("Treasury", `${city.treasury.toLocaleString()}g`)}
      {badge("Happy", city.happiness, { green: 60, yellow: 30 })}
      {badge("Crime", city.crimeRate, { green: 60, yellow: 30, invert: true })}
      {badge("Approval", city.approvalRating, { green: 60, yellow: 30 })}
      {badge("Pop", city.population)}
      {badge("Builds", `${city.activeBuildCount}/4`)}
      <div className="text-[10px] text-zinc-400 font-mono ml-1">
        T{city.totalTicks}
      </div>
    </div>
  );
}
