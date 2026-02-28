"use client";

import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { MultiViewImages } from "@/lib/types";

interface CachedPreviewPickerProps {
  onSelect: (views: MultiViewImages, buildingName: string) => void;
  disabled?: boolean;
}

export default function CachedPreviewPicker({
  onSelect,
  disabled,
}: CachedPreviewPickerProps) {
  const previews = useQuery(api.multiViewPreviews.list, { limit: 10 });

  if (!previews || previews.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        Reuse cached preview
      </label>
      <div className="flex flex-col gap-1.5 max-h-[180px] overflow-y-auto">
        {previews.map((p) => (
          <CachedPreviewItem
            key={p._id}
            id={p._id}
            buildingName={p.buildingName}
            gridUrl={p.gridUrl}
            createdAt={p.createdAt}
            onSelect={onSelect}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}

function CachedPreviewItem({
  id,
  buildingName,
  gridUrl,
  createdAt,
  onSelect,
  disabled,
}: {
  id: Id<"multiViewPreviews">;
  buildingName: string;
  gridUrl: string | null;
  createdAt: number;
  onSelect: (views: MultiViewImages, buildingName: string) => void;
  disabled?: boolean;
}) {
  const urls = useQuery(api.multiViewPreviews.getUrls, { id });

  const handleClick = () => {
    if (!urls || disabled) return;
    onSelect(
      {
        front: urls.front ?? "",
        right: urls.right ?? "",
        back: urls.back ?? "",
        left: urls.left ?? "",
        gridUrl: urls.gridUrl ?? undefined,
      },
      buildingName
    );
  };

  const timeAgo = formatTimeAgo(createdAt);

  return (
    <button
      onClick={handleClick}
      disabled={disabled || !urls}
      className="flex items-center gap-2 p-1.5 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-left"
    >
      {gridUrl && (
        <img
          src={gridUrl}
          alt={buildingName}
          className="w-10 h-10 rounded object-cover shrink-0"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-gray-800 truncate">
          {buildingName}
        </div>
        <div className="text-[10px] text-gray-400">{timeAgo}</div>
      </div>
    </button>
  );
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
