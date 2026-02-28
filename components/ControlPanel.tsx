"use client";

import { useState, useCallback, useEffect } from "react";
import { useWorldStore } from "@/lib/stores/world-store";

interface ControlPanelProps {
  isOwner: boolean;
}

export default function ControlPanel({ isOwner }: ControlPanelProps) {
  const selectedId = useWorldStore((s) => s.selectedId);
  const buildings = useWorldStore((s) => s.buildings);
  const updateTransform = useWorldStore((s) => s.updateTransform);

  const selected = selectedId ? buildings.get(selectedId) : null;

  const [offset, setOffset] = useState<[number, number, number]>([0, 0, 0]);
  const [rotation, setRotation] = useState<[number, number, number]>([0, 0, 0]);
  const [isOpen, setIsOpen] = useState(true);

  // Sync sliders when selection changes
  useEffect(() => {
    if (!selected) return;
    setOffset([...selected.offset]);
    setRotation([...selected.rotation]);
  }, [selected]);

  const handleOffsetChange = useCallback(
    (axis: 0 | 1 | 2, v: number) => {
      const next = [...offset] as [number, number, number];
      next[axis] = v;
      setOffset(next);
      if (selectedId) updateTransform(selectedId, { offset: next });
    },
    [offset, selectedId, updateTransform]
  );

  const handleRotationChange = useCallback(
    (axis: 0 | 1 | 2, v: number) => {
      const next = [...rotation] as [number, number, number];
      next[axis] = v;
      setRotation(next);
      if (selectedId) updateTransform(selectedId, { rotation: next });
    },
    [rotation, selectedId, updateTransform]
  );

  if (!isOwner) {
    return (
      <div className="text-xs text-gray-400 italic py-2">
        You can only adjust buildings on your own plot.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Transform section */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button
          onClick={() => setIsOpen((v) => !v)}
          className="flex items-center justify-between w-full px-3 py-2 bg-gray-50 text-sm font-semibold text-gray-600 select-none"
        >
          Transform
          <span
            className={`text-xs text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          >
            &#9660;
          </span>
        </button>

        {isOpen && (
          <div className="px-3 py-2 space-y-2">
            {/* Vertical offset only — XZ is handled by dragging */}
            <div className="flex items-center text-[10px] text-gray-400 uppercase tracking-wider">
              Height Offset
              <button
                onClick={() => {
                  setOffset([offset[0], 0, offset[2]]);
                  if (selectedId) updateTransform(selectedId, { offset: [offset[0], 0, offset[2]] });
                }}
                className="ml-1.5 text-[10px] text-blue-600 hover:underline"
              >
                reset
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold w-3.5 text-center text-green-500">Y</span>
              <input
                type="range"
                min={-500}
                max={500}
                step={1}
                value={offset[1]}
                onChange={(e) => handleOffsetChange(1, parseFloat(e.target.value))}
                className="flex-1 h-1 accent-blue-600"
              />
              <span className="text-xs text-gray-600 min-w-[36px] text-right tabular-nums">
                {offset[1]}
              </span>
            </div>

            {/* Rotation */}
            <div className="flex items-center text-[10px] text-gray-400 uppercase tracking-wider mt-1.5">
              Rotation
              <button
                onClick={() => {
                  setRotation([0, 0, 0]);
                  if (selectedId) updateTransform(selectedId, { rotation: [0, 0, 0] });
                }}
                className="ml-1.5 text-[10px] text-blue-600 hover:underline"
              >
                reset
              </button>
            </div>
            {(["X", "Y", "Z"] as const).map((axis, i) => (
              <div key={`rot-${axis}`} className="flex items-center gap-1.5">
                <span
                  className={`text-xs font-semibold w-3.5 text-center ${
                    i === 0 ? "text-red-500" : i === 1 ? "text-green-500" : "text-blue-500"
                  }`}
                >
                  {axis}
                </span>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={1}
                  value={rotation[i]}
                  onChange={(e) =>
                    handleRotationChange(i as 0 | 1 | 2, parseFloat(e.target.value))
                  }
                  className="flex-1 h-1 accent-blue-600"
                />
                <span className="text-xs text-gray-600 min-w-[36px] text-right tabular-nums">
                  {rotation[i]}&deg;
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
