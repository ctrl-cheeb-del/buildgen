"use client";

import { useCarStore } from "@/lib/stores/car-store";
import { useEffect, useState } from "react";

export default function CarModeButton() {
  const carMode = useCarStore((s) => s.carMode);
  const toggleCarMode = useCarStore((s) => s.toggleCarMode);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (carMode) {
      setShowHint(true);
      const t = setTimeout(() => setShowHint(false), 4000);
      return () => clearTimeout(t);
    } else {
      setShowHint(false);
    }
  }, [carMode]);

  return (
    <>
      <button
        onClick={toggleCarMode}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
          carMode
            ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30 animate-pulse"
            : "bg-white/90 text-gray-700 hover:bg-white shadow-md"
        }`}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 17h2m10 0h2M6 11l1.5-4.5h9L18 11" />
          <rect x="3" y="11" width="18" height="6" rx="2" />
          <circle cx="7" cy="17" r="1" />
          <circle cx="17" cy="17" r="1" />
        </svg>
        {carMode ? "Driving" : "Drive"}
      </button>

      {carMode && (
        <div className="mt-2 text-right">
          <span className="text-[10px] text-gray-400">ESC to exit</span>
        </div>
      )}

      {/* WASD overlay hint */}
      {showHint && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none">
          <div className="bg-black/70 text-white rounded-xl px-6 py-4 text-center animate-fade-in">
            <div className="flex justify-center mb-2">
              <kbd className="bg-white/20 rounded px-2.5 py-1 text-sm font-mono">
                W
              </kbd>
            </div>
            <div className="flex justify-center gap-1">
              <kbd className="bg-white/20 rounded px-2.5 py-1 text-sm font-mono">
                A
              </kbd>
              <kbd className="bg-white/20 rounded px-2.5 py-1 text-sm font-mono">
                S
              </kbd>
              <kbd className="bg-white/20 rounded px-2.5 py-1 text-sm font-mono">
                D
              </kbd>
            </div>
            <div className="flex justify-center mt-2">
              <kbd className="bg-white/20 rounded px-4 py-1 text-sm font-mono">
                SPACE
              </kbd>
            </div>
            <p className="text-xs text-gray-300 mt-2">WASD to drive / SPACE to drift</p>
          </div>
        </div>
      )}
    </>
  );
}
