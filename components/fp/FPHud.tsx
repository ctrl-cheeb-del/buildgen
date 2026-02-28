"use client";

import React, { useEffect, useState } from "react";

interface FPHudProps {
  handle: string;
  avatarUrl?: string;
  isLocked: boolean;
  onExit: () => void;
}

export default function FPHud({
  handle,
  avatarUrl,
  isLocked,
  onExit,
}: FPHudProps) {
  const [showHint, setShowHint] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShowHint(false), 4000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Crosshair */}
      {isLocked && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="w-5 h-5 relative">
            <div className="absolute top-1/2 left-0 w-full h-px bg-white/60" />
            <div className="absolute top-0 left-1/2 w-px h-full bg-white/60" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-white/80" />
          </div>
        </div>
      )}

      {/* Click to look prompt */}
      {!isLocked && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <div className="bg-black/70 text-white rounded-xl px-6 py-3 text-sm font-medium">
            Click to look around
          </div>
        </div>
      )}

      {/* Handle badge — top left */}
      <div className="absolute top-4 left-4">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-sm">
          {avatarUrl && (
            <img
              src={avatarUrl}
              alt=""
              className="w-5 h-5 rounded-full"
            />
          )}
          <span className="text-xs font-semibold text-white">
            @{handle}
          </span>
        </div>
      </div>

      {/* Exit button — top right */}
      <div className="absolute top-4 right-4 pointer-events-auto">
        <button
          onClick={onExit}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/90 text-gray-700 hover:bg-white shadow-md transition-colors"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
          Exit
        </button>
        <div className="mt-1 text-right">
          <span className="text-[10px] text-white/60">ESC to unlock</span>
        </div>
      </div>

      {/* WASD hint — fades after 4s */}
      {showHint && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 animate-fade-in">
          <div className="bg-black/70 text-white rounded-xl px-6 py-4 text-center">
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
            <p className="text-xs text-gray-300 mt-2">
              WASD to walk / SHIFT to sprint / SPACE to jump
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
