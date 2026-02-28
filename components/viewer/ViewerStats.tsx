"use client";

import type { GeometryStats } from "@/lib/viewer/geometry-stats";

interface ViewerStatsProps {
  stats: GeometryStats | null;
}

export default function ViewerStats({ stats }: ViewerStatsProps) {
  if (!stats) {
    return (
      <div className="p-3 bg-gray-800 rounded-lg text-gray-500 text-sm">
        No building loaded
      </div>
    );
  }

  return (
    <div className="p-3 bg-gray-800 rounded-lg text-sm space-y-2">
      <h3 className="font-semibold text-white">Geometry Stats</h3>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-300">
        <span>Dimensions</span>
        <span className="text-white font-mono text-xs">
          {stats.dimensions.x} x {stats.dimensions.y} x {stats.dimensions.z}
        </span>

        <span>Height</span>
        <span className="text-white font-mono text-xs">
          {stats.minY} to {stats.maxY}
        </span>

        <span>Footprint</span>
        <span className="text-white font-mono text-xs">
          {stats.footprint.x} x {stats.footprint.z}
        </span>

        <span>Meshes / Verts</span>
        <span className="text-white font-mono text-xs">
          {stats.meshCount} / {stats.vertexCount.toLocaleString()}
        </span>
      </div>

      <div className="flex gap-2 pt-1">
        <StatusBadge ok={stats.isGrounded} label="Grounded" />
        <StatusBadge ok={stats.fitsFootprint} label="Fits 30m" />
      </div>
    </div>
  );
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-medium ${
        ok
          ? "bg-emerald-900/50 text-emerald-400"
          : "bg-red-900/50 text-red-400"
      }`}
    >
      {ok ? "\u2713" : "\u2717"} {label}
    </span>
  );
}
