"use client";

import { useState } from "react";

interface IteratePanelProps {
  onIterate: (feedback?: string) => Promise<void>;
  onAutoIterate: (count: number) => Promise<void>;
  isRunning: boolean;
  iterationCount: number;
  totalIterations: number;
  lastAnalysis: string | null;
  disabled: boolean;
}

export default function IteratePanel({
  onIterate,
  onAutoIterate,
  isRunning,
  iterationCount,
  totalIterations,
  lastAnalysis,
  disabled,
}: IteratePanelProps) {
  const [feedback, setFeedback] = useState("");
  const [autoCount, setAutoCount] = useState(3);

  const handleManualIterate = async () => {
    const fb = feedback.trim() || undefined;
    setFeedback("");
    await onIterate(fb);
  };

  return (
    <div className="p-3 bg-gray-800 rounded-lg space-y-3">
      <h3 className="font-semibold text-white text-sm">Iterate</h3>

      {/* Progress */}
      {isRunning && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
            <span className="text-xs text-amber-300">
              Iteration {iterationCount} / {totalIterations}
            </span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-1.5">
            <div
              className="bg-amber-400 h-1.5 rounded-full transition-all duration-300"
              style={{
                width: `${totalIterations > 0 ? (iterationCount / totalIterations) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Manual feedback */}
      <div className="space-y-1">
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Optional feedback (e.g. 'make it taller', 'fix grounding')..."
          className="w-full h-16 bg-gray-900 text-gray-200 text-xs p-2 rounded border border-gray-700 resize-none focus:outline-none focus:border-blue-500"
          disabled={isRunning}
        />
        <button
          onClick={handleManualIterate}
          disabled={disabled || isRunning}
          className="w-full px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:text-gray-400 text-white rounded transition-colors"
        >
          Iterate Once
        </button>
      </div>

      {/* Auto-iterate */}
      <div className="flex gap-2">
        <select
          value={autoCount}
          onChange={(e) => setAutoCount(Number(e.target.value))}
          disabled={isRunning}
          className="bg-gray-700 text-gray-200 text-xs rounded px-2 py-1.5 border border-gray-600 focus:outline-none"
        >
          {[1, 2, 3, 5, 10].map((n) => (
            <option key={n} value={n}>
              x{n}
            </option>
          ))}
        </select>
        <button
          onClick={() => onAutoIterate(autoCount)}
          disabled={disabled || isRunning}
          className="flex-1 px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-500 disabled:bg-gray-600 disabled:text-gray-400 text-white rounded font-medium transition-colors"
        >
          {isRunning ? "Running..." : `Auto-iterate x${autoCount}`}
        </button>
      </div>

      {/* Last analysis */}
      {lastAnalysis && (
        <div className="space-y-1">
          <span className="text-xs text-gray-400">Last Analysis</span>
          <p className="text-xs text-gray-300 bg-gray-900 p-2 rounded border border-gray-700 max-h-32 overflow-y-auto whitespace-pre-wrap">
            {lastAnalysis}
          </p>
        </div>
      )}
    </div>
  );
}
