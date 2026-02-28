"use client";

import type { MultiViewImages } from "@/lib/types";

interface ReferencePanelProps {
  referenceImages: MultiViewImages | null;
  renderScreenshots: {
    front: string;
    right: string;
    back: string;
    left: string;
  } | null;
}

const VIEWS = ["front", "right", "back", "left"] as const;

export default function ReferencePanel({
  referenceImages,
  renderScreenshots,
}: ReferencePanelProps) {
  if (!referenceImages && !renderScreenshots) {
    return (
      <div className="p-3 bg-gray-800 rounded-lg text-gray-500 text-sm">
        No images to display
      </div>
    );
  }

  return (
    <div className="p-3 bg-gray-800 rounded-lg space-y-3">
      {referenceImages && (
        <div>
          <h3 className="font-semibold text-white text-sm mb-2">Reference</h3>
          <div className="grid grid-cols-4 gap-1">
            {VIEWS.map((view) => (
              <div key={view} className="space-y-0.5">
                <span className="text-[10px] text-gray-500 uppercase">
                  {view}
                </span>
                <img
                  src={referenceImages[view]}
                  alt={`${view} reference`}
                  className="w-full aspect-square object-cover rounded border border-gray-700"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {renderScreenshots && (
        <div>
          <h3 className="font-semibold text-white text-sm mb-2">
            Current Render
          </h3>
          <div className="grid grid-cols-4 gap-1">
            {VIEWS.map((view) => (
              <div key={view} className="space-y-0.5">
                <span className="text-[10px] text-gray-500 uppercase">
                  {view}
                </span>
                <img
                  src={renderScreenshots[view]}
                  alt={`${view} render`}
                  className="w-full aspect-square object-cover rounded border border-gray-700"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
