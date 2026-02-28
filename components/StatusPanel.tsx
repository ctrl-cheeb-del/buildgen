"use client";

import type { PipelineStatus } from "@/lib/types";

interface StatusPanelProps {
  steps: Record<string, PipelineStatus>;
}

const STEP_LABELS: Record<string, string> = {
  multiview: "Multi-View Generation",
  generate: "3D Generation",
  render: "Render on Map",
};

export default function StatusPanel({ steps }: StatusPanelProps) {
  const hasActivity = Object.values(steps).some((s) => s.state !== "idle");
  if (!hasActivity) return null;

  return (
    <div className="text-sm text-gray-600 space-y-1">
      {Object.entries(steps).map(([key, step]) => {
        if (step.state === "idle") return null;
        return (
          <div key={key} className="flex items-center gap-2 py-1">
            <div
              className={`w-2 h-2 rounded-full shrink-0 ${
                step.state === "running"
                  ? "bg-amber-400 animate-pulse"
                  : step.state === "done"
                    ? "bg-emerald-500"
                    : step.state === "error"
                      ? "bg-red-500"
                      : "bg-gray-300"
              }`}
            />
            <span className="text-gray-800 text-xs">
              {STEP_LABELS[key] || key}
            </span>
            {step.detail && (
              <span className="text-gray-400 text-xs ml-auto">
                {step.detail}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
