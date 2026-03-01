"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

type ThresholdColor = "emerald" | "amber" | "red" | "neutral";

function getColor(
  value: number | string,
  thresholds?: { green: number; yellow: number; invert?: boolean }
): ThresholdColor {
  if (!thresholds || typeof value !== "number") return "neutral";
  if (thresholds.invert) {
    if (value <= thresholds.yellow) return "emerald";
    if (value <= thresholds.green) return "amber";
    return "red";
  }
  if (value >= thresholds.green) return "emerald";
  if (value >= thresholds.yellow) return "amber";
  return "red";
}

const dotColor: Record<ThresholdColor, string> = {
  emerald: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]",
  amber: "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]",
  red: "bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.6)]",
  neutral: "bg-white/30",
};

const valueColor: Record<ThresholdColor, string> = {
  emerald: "text-emerald-300",
  amber: "text-amber-300",
  red: "text-red-300",
  neutral: "text-white/90",
};

function badge(
  label: string,
  value: number | string,
  thresholds?: { green: number; yellow: number; invert?: boolean }
) {
  const color = getColor(value, thresholds);
  return (
    <div className="flex items-center gap-1.5 px-2 py-0.5">
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor[color]}`} />
      <span className="text-[10px] uppercase text-white/50 font-medium tracking-wide">
        {label}
      </span>
      <span className={`text-xs font-bold font-mono ${valueColor[color]}`}>
        {typeof value === "number" ? Math.round(value) : value}
      </span>
    </div>
  );
}

function separator() {
  return <div className="w-px h-4 bg-white/10" />;
}

export default function MetricsBar() {
  const city = useQuery(api.simulation.cityState.get);
  const plots = useQuery(api.plots.getPlots);

  if (!city) return null;

  const generatingCount =
    plots?.filter((p) => p.status === "generating").length ?? 0;
  const buildCap = city.simMode === "live" ? 12 : 2;

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 pointer-events-auto">
      <div className="flex items-center gap-0.5 px-2 py-1 rounded-full bg-black/35 backdrop-blur-2xl border border-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.15),inset_0_-1px_0_rgba(0,0,0,0.15),0_4px_24px_rgba(0,0,0,0.35)]">
        {/* Inner highlight gradient for depth */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/[0.08] to-transparent pointer-events-none" />

        {badge("Treasury", `$${city.treasury.toLocaleString()}`)}
        {separator()}
        {badge("Happy", city.happiness, { green: 60, yellow: 30 })}
        {separator()}
        {badge("Crime", city.crimeRate, { green: 60, yellow: 30, invert: true })}
        {separator()}
        {badge("Approval", city.approvalRating, { green: 60, yellow: 30 })}
        {separator()}
        {badge("Pop", city.population)}
        {separator()}
        {badge("Builds", `${generatingCount}/${buildCap}`)}
        {separator()}
        <div className="text-[10px] text-white/40 font-mono px-2 py-0.5">
          Week {Math.max(1, Math.ceil(city.totalTicks / 12))}
        </div>
      </div>
    </div>
  );
}
