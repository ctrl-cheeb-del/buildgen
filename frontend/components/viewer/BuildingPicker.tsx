"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

interface BuildingPickerProps {
  onSelect: (building: {
    name: string;
    code: string;
    multiViewGrid?: string;
  }) => void;
  onPasteCode: (code: string) => void;
}

export default function BuildingPicker({
  onSelect,
  onPasteCode,
}: BuildingPickerProps) {
  const buildings = useQuery(api.buildings.getAllBuildings);
  const [pasteMode, setPasteMode] = useState(false);
  const [pastedCode, setPastedCode] = useState("");

  return (
    <div className="p-3 bg-gray-800 rounded-lg space-y-2">
      <h3 className="font-semibold text-white text-sm">Load Building</h3>

      {/* Building list from Convex */}
      <div className="max-h-40 overflow-y-auto space-y-1">
        {buildings?.map((b) => (
          <button
            key={b._id}
            onClick={() =>
              onSelect({
                name: b.prompt,
                code: b.proceduralCode,
                multiViewGrid: b.multiViewGrid,
              })
            }
            className="w-full text-left px-2 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-200 truncate transition-colors"
          >
            Plot #{b.plotIndex} &mdash; {b.prompt}
          </button>
        ))}
        {buildings?.length === 0 && (
          <p className="text-gray-500 text-xs">No buildings in database</p>
        )}
      </div>

      {/* Paste code toggle */}
      <button
        onClick={() => setPasteMode(!pasteMode)}
        className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
      >
        {pasteMode ? "Hide paste" : "Or paste code..."}
      </button>

      {pasteMode && (
        <div className="space-y-1">
          <textarea
            value={pastedCode}
            onChange={(e) => setPastedCode(e.target.value)}
            placeholder="Paste Three.js code here..."
            className="w-full h-24 bg-gray-900 text-gray-200 text-xs font-mono p-2 rounded border border-gray-700 resize-none focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={() => {
              if (pastedCode.trim()) onPasteCode(pastedCode.trim());
            }}
            disabled={!pastedCode.trim()}
            className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:text-gray-400 text-white rounded transition-colors"
          >
            Load Code
          </button>
        </div>
      )}
    </div>
  );
}
