"use client";

import { useState, useCallback } from "react";

interface PromptBarProps {
  onGenerate: (buildingName: string, lng: number, lat: number) => void;
  isRunning: boolean;
}

export default function PromptBar({ onGenerate, isRunning }: PromptBarProps) {
  const [buildingName, setBuildingName] = useState("");
  const [lng, setLng] = useState(-73.9857);
  const [lat, setLat] = useState(40.7484);

  const handleGenerate = useCallback(() => {
    if (!buildingName.trim() || isRunning) return;
    onGenerate(buildingName.trim(), lng, lat);
  }, [buildingName, lng, lat, isRunning, onGenerate]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={buildingName}
          onChange={(e) => setBuildingName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
          placeholder="Describe any building... e.g. a beaver-shaped skyscraper"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-blue-500 transition-colors"
        />
        <button
          onClick={handleGenerate}
          disabled={isRunning || !buildingName.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          Generate
        </button>
      </div>
      <div className="flex gap-2">
        <input
          type="number"
          step="any"
          value={lng}
          onChange={(e) => setLng(parseFloat(e.target.value) || 0)}
          placeholder="Longitude"
          className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-xs outline-none focus:border-blue-500"
        />
        <input
          type="number"
          step="any"
          value={lat}
          onChange={(e) => setLat(parseFloat(e.target.value) || 0)}
          placeholder="Latitude"
          className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-xs outline-none focus:border-blue-500"
        />
      </div>
    </div>
  );
}
