"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ConvexProvider, ConvexReactClient, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import ThreeCanvas, {
  type ThreeCanvasHandle,
} from "@/components/viewer/ThreeCanvas";
import ViewerStats from "@/components/viewer/ViewerStats";
import BuildingPicker from "@/components/viewer/BuildingPicker";
import ReferencePanel from "@/components/viewer/ReferencePanel";
import CodePanel from "@/components/viewer/CodePanel";
import { loadProceduralGeometry } from "@/lib/viewer/procedural-loader";
import type { GeometryStats } from "@/lib/viewer/geometry-stats";
import type { MultiViewImages } from "@/lib/types";

const convex = new ConvexReactClient(
  process.env.NEXT_PUBLIC_CONVEX_URL as string
);

function ViewerPage() {
  const canvasRef = useRef<ThreeCanvasHandle>(null);

  const [stats, setStats] = useState<GeometryStats | null>(null);
  const [code, setCode] = useState("");
  const [buildingName, setBuildingName] = useState("");
  const [referenceImages, setReferenceImages] =
    useState<MultiViewImages | null>(null);

  // Auto-fetch reference images from Convex when building name changes
  const previewUrls = useQuery(
    api.multiViewPreviews.getUrlsByBuildingName,
    buildingName ? { buildingName } : "skip"
  );

  useEffect(() => {
    if (previewUrls && previewUrls.front && previewUrls.right && previewUrls.back && previewUrls.left) {
      setReferenceImages({
        front: previewUrls.front,
        right: previewUrls.right,
        back: previewUrls.back,
        left: previewUrls.left,
        gridUrl: previewUrls.gridUrl ?? undefined,
      });
    }
  }, [previewUrls]);

  const loadCode = useCallback(
    (newCode: string): GeometryStats | null => {
      const group = loadProceduralGeometry(newCode);
      const newStats = canvasRef.current?.loadGroup(group) ?? null;
      setCode(newCode);
      return newStats;
    },
    []
  );

  const handleSelectBuilding = useCallback(
    (building: { name: string; code: string; multiViewGrid?: string }) => {
      setBuildingName(building.name);
      loadCode(building.code);
      setReferenceImages(null);
    },
    [loadCode]
  );

  const handlePasteCode = useCallback(
    (pastedCode: string) => {
      setBuildingName("Pasted building");
      loadCode(pastedCode);
      setReferenceImages(null);
    },
    [loadCode]
  );

  const handleCodeUpdate = useCallback(
    (newCode: string) => {
      loadCode(newCode);
    },
    [loadCode]
  );

  const handleLoadReferenceUrls = useCallback(
    (urls: { front: string; right: string; back: string; left: string }) => {
      setReferenceImages(urls);
    },
    []
  );

  return (
    <div className="h-screen flex bg-gray-950 text-gray-100">
      {/* Left sidebar */}
      <div className="w-80 flex flex-col gap-2 p-2 overflow-y-auto border-r border-gray-800">
        <h1 className="text-lg font-bold px-1">Viewer</h1>

        <BuildingPicker
          onSelect={handleSelectBuilding}
          onPasteCode={handlePasteCode}
        />

        <ViewerStats stats={stats} />

        {/* Reference URL inputs */}
        <ReferenceUrlInputs onLoad={handleLoadReferenceUrls} />
      </div>

      {/* Center canvas */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 p-2">
          <ThreeCanvas ref={canvasRef} onStatsUpdate={setStats} />
        </div>
      </div>

      {/* Right sidebar */}
      <div className="w-96 flex flex-col gap-2 p-2 overflow-y-auto border-l border-gray-800">
        <ReferencePanel
          referenceImages={referenceImages}
          renderScreenshots={null}
        />
        <CodePanel code={code} onUpdate={handleCodeUpdate} />
      </div>
    </div>
  );
}

/** Simple inputs for pasting reference image URLs */
function ReferenceUrlInputs({
  onLoad,
}: {
  onLoad: (urls: {
    front: string;
    right: string;
    back: string;
    left: string;
  }) => void;
}) {
  const [urls, setUrls] = useState({
    front: "",
    right: "",
    back: "",
    left: "",
  });

  const anyFilled = Object.values(urls).some((u) => u.trim());

  return (
    <div className="p-3 bg-gray-800 rounded-lg space-y-2">
      <h3 className="font-semibold text-white text-sm">Reference Images</h3>
      {(["front", "right", "back", "left"] as const).map((view) => (
        <input
          key={view}
          type="text"
          placeholder={`${view} URL`}
          value={urls[view]}
          onChange={(e) => setUrls((prev) => ({ ...prev, [view]: e.target.value }))}
          className="w-full bg-gray-900 text-gray-200 text-xs p-1.5 rounded border border-gray-700 focus:outline-none focus:border-blue-500"
        />
      ))}
      <button
        onClick={() => {
          if (anyFilled) onLoad(urls);
        }}
        disabled={!anyFilled}
        className="w-full px-3 py-1 text-xs bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 disabled:text-gray-400 text-white rounded transition-colors"
      >
        Set References
      </button>
    </div>
  );
}

export default function ViewerPageWrapper() {
  return (
    <ConvexProvider client={convex}>
      <ViewerPage />
    </ConvexProvider>
  );
}
