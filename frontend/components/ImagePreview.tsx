"use client";

import { useState } from "react";
import type { MultiViewImages } from "@/lib/types";

interface ImagePreviewProps {
  multiView: MultiViewImages | null;
}

export default function ImagePreview({ multiView }: ImagePreviewProps) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  if (!multiView) return null;

  const views = [
    { key: "front", label: "Front" },
    { key: "right", label: "Right" },
    { key: "back", label: "Back" },
    { key: "left", label: "Left" },
  ] as const;

  return (
    <>
      <div className="mt-3 space-y-2 animate-in fade-in duration-400">
        <h3 className="text-sm text-gray-600 font-medium">
          Multi-View Preview
        </h3>
        {multiView.gridUrl && (
          <img
            src={multiView.gridUrl}
            alt="2x2 Grid"
            className="w-full rounded-lg cursor-pointer"
            onClick={() => setLightboxSrc(multiView.gridUrl!)}
          />
        )}
        <div className="grid grid-cols-4 gap-1.5">
          {views.map(({ key, label }) => (
            <div key={key}>
              <img
                src={multiView[key]}
                alt={label}
                className="w-full aspect-square object-cover rounded-md border border-gray-200 cursor-pointer hover:scale-105 hover:shadow-md transition-all"
                onClick={() => setLightboxSrc(multiView[key])}
              />
              <div className="text-[10px] text-gray-400 text-center mt-0.5">
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center cursor-pointer"
          onClick={() => setLightboxSrc(null)}
        >
          <img
            src={lightboxSrc}
            alt="Preview"
            className="max-w-[90vw] max-h-[90vh] rounded-lg shadow-2xl"
          />
        </div>
      )}
    </>
  );
}
