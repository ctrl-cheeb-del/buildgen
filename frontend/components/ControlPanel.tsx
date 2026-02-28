"use client";

import { useState, useCallback, useEffect } from "react";
import { useWorldStore } from "@/lib/stores/world-store";

export default function ControlPanel() {
  const selectedId = useWorldStore((s) => s.selectedId);
  const buildings = useWorldStore((s) => s.buildings);
  const updateTransform = useWorldStore((s) => s.updateTransform);

  const selected = selectedId ? buildings.get(selectedId) : null;

  const [scale, setScale] = useState(0); // log scale
  const [offset, setOffset] = useState<[number, number, number]>([0, 0, 0]);
  const [rotation, setRotation] = useState<[number, number, number]>([0, 0, 0]);
  const [isOpen, setIsOpen] = useState(true);

  // Sync sliders when selection changes
  useEffect(() => {
    if (!selected) return;
    setScale(Math.log10(selected.scale));
    setOffset([...selected.offset]);
    setRotation([...selected.rotation]);
  }, [selected]);

  const handleScaleChange = useCallback(
    (v: number) => {
      setScale(v);
      const s = Math.pow(10, v);
      if (selectedId) updateTransform(selectedId, { scale: s });
    },
    [selectedId, updateTransform]
  );

  const handleOffsetChange = useCallback(
    (axis: 0 | 1 | 2, v: number) => {
      setOffset((prev) => {
        const next = [...prev] as [number, number, number];
        next[axis] = v;
        if (selectedId) updateTransform(selectedId, { offset: next });
        return next;
      });
    },
    [selectedId, updateTransform]
  );

  const handleRotationChange = useCallback(
    (axis: 0 | 1 | 2, v: number) => {
      setRotation((prev) => {
        const next = [...prev] as [number, number, number];
        next[axis] = v;
        if (selectedId) updateTransform(selectedId, { rotation: next });
        return next;
      });
    },
    [selectedId, updateTransform]
  );

  const scaleDisplay = Math.pow(10, scale);

  return (
    <div className="space-y-3">
      {/* Scale */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500 shrink-0">Scale</label>
        <input
          type="range"
          min={-1}
          max={1.5}
          step={0.01}
          value={scale}
          onChange={(e) => handleScaleChange(parseFloat(e.target.value))}
          className="flex-1 h-1 accent-blue-600"
        />
        <span className="text-xs text-gray-600 min-w-[32px] text-right tabular-nums">
          {scaleDisplay < 10
            ? `${scaleDisplay.toFixed(1)}x`
            : `${Math.round(scaleDisplay)}x`}
        </span>
      </div>

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
            {/* Offset */}
            <div className="flex items-center text-[10px] text-gray-400 uppercase tracking-wider">
              Position Offset
              <button
                onClick={() => {
                  setOffset([0, 0, 0]);
                  if (selectedId) updateTransform(selectedId, { offset: [0, 0, 0] });
                }}
                className="ml-1.5 text-[10px] text-blue-600 hover:underline"
              >
                reset
              </button>
            </div>
            {(["X", "Y", "Z"] as const).map((axis, i) => (
              <div key={`off-${axis}`} className="flex items-center gap-1.5">
                <span
                  className={`text-xs font-semibold w-3.5 text-center ${
                    i === 0 ? "text-red-500" : i === 1 ? "text-green-500" : "text-blue-500"
                  }`}
                >
                  {axis}
                </span>
                <input
                  type="range"
                  min={-500}
                  max={500}
                  step={1}
                  value={offset[i]}
                  onChange={(e) =>
                    handleOffsetChange(i as 0 | 1 | 2, parseFloat(e.target.value))
                  }
                  className="flex-1 h-1 accent-blue-600"
                />
                <span className="text-xs text-gray-600 min-w-[36px] text-right tabular-nums">
                  {offset[i]}
                </span>
              </div>
            ))}

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
