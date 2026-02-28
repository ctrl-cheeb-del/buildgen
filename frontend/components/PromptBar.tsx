"use client";

import { useState, useCallback, useEffect } from "react";

interface PromptBarProps {
  onGenerate: (buildingName: string) => void;
  isRunning: boolean;
  overrideName?: string;
  nextPlotIndex: number | null;
  totalPlots: number;
  filledPlots: number;
}

export default function PromptBar({
  onGenerate,
  isRunning,
  overrideName,
  nextPlotIndex,
  totalPlots,
  filledPlots,
}: PromptBarProps) {
  const [buildingName, setBuildingName] = useState("");

  const allFull = nextPlotIndex === null;

  useEffect(() => {
    if (overrideName) setBuildingName(overrideName);
  }, [overrideName]);

  const handleGenerate = useCallback(() => {
    if (!buildingName.trim() || isRunning || allFull) return;
    onGenerate(buildingName.trim());
    setBuildingName("");
  }, [buildingName, isRunning, allFull, onGenerate]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={buildingName}
          onChange={(e) => setBuildingName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
          placeholder={
            allFull
              ? "All plots full"
              : "Describe any building... e.g. a beaver-shaped skyscraper"
          }
          disabled={allFull}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-500 outline-none focus:border-blue-500 transition-colors disabled:bg-gray-100 disabled:text-gray-400"
        />
        <button
          onClick={handleGenerate}
          disabled={isRunning || !buildingName.trim() || allFull}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          Generate
        </button>
      </div>
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          {allFull
            ? "All plots full"
            : `Building will be placed in Plot #${nextPlotIndex}`}
        </span>
        <span>
          {filledPlots}/{totalPlots} plots filled
        </span>
      </div>
    </div>
  );
}
