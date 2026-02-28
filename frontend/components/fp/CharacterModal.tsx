"use client";

import { useState } from "react";

const COLORS = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#22c55e", // green
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
];

interface CharacterModalProps {
  onConfirm: (name: string, color: string) => void;
  onCancel: () => void;
}

export default function CharacterModal({
  onConfirm,
  onCancel,
}: CharacterModalProps) {
  const [name, setName] = useState("Explorer");
  const [color, setColor] = useState(COLORS[0]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-[340px]">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Enter the City</h2>

        <label className="block text-sm font-medium text-gray-700 mb-1">
          Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
          autoFocus
        />

        <label className="block text-sm font-medium text-gray-700 mb-2">
          Accent Color
        </label>
        <div className="flex gap-2 mb-6">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className="w-8 h-8 rounded-full transition-transform"
              style={{
                backgroundColor: c,
                transform: color === c ? "scale(1.25)" : "scale(1)",
                boxShadow:
                  color === c ? `0 0 0 3px white, 0 0 0 5px ${c}` : "none",
              }}
            />
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(name.trim() || "Explorer", color)}
            className="flex-1 px-4 py-2 text-sm font-bold text-white rounded-lg transition-colors"
            style={{ backgroundColor: color }}
          >
            Enter World
          </button>
        </div>
      </div>
    </div>
  );
}
