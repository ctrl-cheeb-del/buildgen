"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import PromptBar from "./PromptBar";
import ControlPanel from "./ControlPanel";

interface SettingsPanelProps {
  // Pipeline
  isRunning: boolean;
  onGenerate: (name: string) => void;
  // Plot
  myPlot: { index: number; status: string } | null | undefined;
  totalPlots: number;
  filledPlots: number;
  onReleasePlot: () => void;
  // Buildings
  myBuildings: Array<{ _id: string; prompt: string }> | undefined;
  selectedId: string | null;
  onSelectBuilding: (id: string) => void;
  onDeleteBuilding: (id: string) => void;
  isOwnerOfSelected: boolean;
}

export default function SettingsPanel(props: SettingsPanelProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const {
    isRunning,
    onGenerate,
    myPlot,
    totalPlots,
    filledPlots,
    onReleasePlot,
    myBuildings,
    selectedId,
    onSelectBuilding,
    onDeleteBuilding,
    isOwnerOfSelected,
  } = props;

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <>
      {/* Gear button */}
      <button
        onClick={() => setOpen(!open)}
        className="w-9 h-9 flex items-center justify-center rounded-full bg-white/15 backdrop-blur-2xl border border-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_4px_16px_rgba(0,0,0,0.2)] text-white/80 hover:bg-white/25 transition-colors"
        title="Settings"
      >
        <svg
          className="w-4.5 h-4.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
      </button>

      {/* Slide-out panel */}
      <div
        ref={panelRef}
        className={`fixed top-0 right-0 z-50 h-full w-[360px] max-w-[calc(100vw-16px)] bg-black/40 backdrop-blur-2xl border-l border-white/15 shadow-[-8px_0_32px_rgba(0,0,0,0.3)] transform transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="h-full overflow-y-auto p-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-white">Settings</h2>
            <button
              onClick={() => setOpen(false)}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Plot status */}
          {myPlot ? (
            <div className="mb-3 px-3 py-2 bg-blue-500/20 border border-blue-400/30 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-xs text-blue-200">
                  Your plot: <strong>#{myPlot.index}</strong> ({myPlot.status})
                </span>
                <button
                  onClick={onReleasePlot}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Release
                </button>
              </div>
            </div>
          ) : (
            <div className="mb-3 px-3 py-2 bg-white/5 border border-white/10 rounded-lg">
              <span className="text-xs text-white/50">
                Click an empty plot on the map to claim it.
              </span>
            </div>
          )}

          <PromptBar
            onGenerate={onGenerate}
            isRunning={isRunning}
            nextPlotIndex={myPlot?.index ?? null}
            totalPlots={totalPlots}
            filledPlots={filledPlots}
          />

          {isRunning && (
            <div className="mt-2 flex items-center gap-2 px-2 py-1.5 bg-amber-500/20 border border-amber-400/30 rounded-lg">
              <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-amber-200">
                Generating building server-side...
              </span>
            </div>
          )}

          {/* Building list */}
          {myBuildings && myBuildings.length > 0 && (
            <div className="mt-3 border border-white/10 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-white/5 text-xs font-semibold text-white/60">
                Your Buildings ({myBuildings.length})
              </div>
              <div className="divide-y divide-white/5">
                {myBuildings.map((b) => (
                  <div
                    key={b._id}
                    className={`flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-white/5 ${
                      selectedId === b._id ? "bg-blue-500/20" : ""
                    }`}
                    onClick={() => onSelectBuilding(b._id)}
                  >
                    <span className="text-xs text-white/70 truncate flex-1">
                      {b.prompt}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteBuilding(b._id);
                      }}
                      className="text-xs text-red-400 hover:text-red-300 ml-2"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Transform controls */}
          {selectedId && (
            <div className="mt-3">
              <ControlPanel isOwner={isOwnerOfSelected} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
