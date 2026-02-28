"use client";

import { useState } from "react";
import {
  usePipelineStore,
  type PipelineNodeId,
  type NodeStatus,
} from "@/lib/stores/pipeline-store";
import type {
  MultiViewImages,
  IterationResult,
  ScoreBreakdown,
} from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Heroicon SVG paths (outline, 24x24 viewBox)                        */
/* ------------------------------------------------------------------ */

const ICONS: Record<PipelineNodeId, string> = {
  "generate-views":
    "M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  "generate-code":
    "M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5",
  "place-on-map":
    "M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z",
  capture:
    "M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z",
  score:
    "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z",
  improve:
    "M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.048.58.024 1.194-.14 1.743Z",
  update:
    "M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182",
};

/* ------------------------------------------------------------------ */
/*  Status dot color                                                    */
/* ------------------------------------------------------------------ */

function dotColor(status: NodeStatus): string {
  switch (status) {
    case "pending":
      return "bg-white/30";
    case "active":
      return "bg-blue-400 animate-pulse";
    case "done":
      return "bg-green-400";
    case "error":
      return "bg-red-400";
  }
}

function pillGlow(status: NodeStatus): string {
  switch (status) {
    case "active":
      return "animate-glow";
    default:
      return "";
  }
}

function connectorColor(status: NodeStatus): string {
  switch (status) {
    case "done":
      return "bg-green-400/50";
    case "active":
      return "bg-blue-400/50";
    case "error":
      return "bg-red-400/50";
    default:
      return "bg-white/15";
  }
}

/* ------------------------------------------------------------------ */
/*  Score helpers                                                       */
/* ------------------------------------------------------------------ */

function scoreBarColor(score: number): string {
  if (score >= 7) return "bg-green-400/70";
  if (score >= 4) return "bg-yellow-400/70";
  return "bg-red-400/70";
}

function scoreTextColor(score: number): string {
  if (score >= 7) return "text-green-300";
  if (score >= 4) return "text-yellow-300";
  return "text-red-300";
}

/* ------------------------------------------------------------------ */
/*  NodeIcon                                                            */
/* ------------------------------------------------------------------ */

function NodeIcon({ nodeId }: { nodeId: PipelineNodeId }) {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={ICONS[nodeId]} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  VerticalConnector                                                   */
/* ------------------------------------------------------------------ */

function VerticalConnector({ status }: { status: NodeStatus }) {
  return (
    <div className="flex items-center pl-[18px]">
      <div className={`w-[2px] h-3 rounded-full ${connectorColor(status)}`} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  NodeDetailPanel — glass popover to the right of clicked pill        */
/* ------------------------------------------------------------------ */

interface DetailPanelProps {
  nodeId: PipelineNodeId;
  multiView: MultiViewImages | null;
  iterations: IterationResult[];
  selectedBuilding: { proceduralCode: string; prompt: string; plotIndex: number } | null;
}

function NodeDetailPanel({ nodeId, multiView, iterations, selectedBuilding }: DetailPanelProps) {
  const latest = iterations.length > 0 ? iterations[iterations.length - 1] : null;

  return (
    <div className="absolute left-full ml-2 top-0 w-56 bg-white/15 backdrop-blur-2xl rounded-2xl border border-white/25 shadow-[0_8px_32px_rgba(0,0,0,0.3)] p-3 z-50 animate-fade-in">
      {nodeId === "generate-views" && multiView && (
        <div>
          <div className="text-[10px] text-white/50 mb-1.5">Blueprint Views</div>
          <div className="grid grid-cols-2 gap-1">
            {(["front", "right", "back", "left"] as const).map((angle) => (
              <div key={angle} className="relative aspect-square rounded-lg overflow-hidden bg-black/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={multiView[angle]}
                  alt={angle}
                  className="w-full h-full object-cover"
                />
                <span className="absolute bottom-0.5 left-0.5 text-[8px] text-white/60 bg-black/40 px-1 rounded">
                  {angle}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {nodeId === "generate-code" && selectedBuilding && (
        <div>
          <div className="text-[10px] text-white/50 mb-1.5">Code Preview</div>
          <pre className="text-[9px] text-white/70 font-mono bg-black/20 rounded-lg p-2 overflow-hidden max-h-40 leading-relaxed">
            {selectedBuilding.proceduralCode.split("\n").slice(0, 12).join("\n")}
            {selectedBuilding.proceduralCode.split("\n").length > 12 && "\n..."}
          </pre>
        </div>
      )}

      {nodeId === "place-on-map" && selectedBuilding && (
        <div>
          <div className="text-[10px] text-white/50 mb-1.5">Plot Info</div>
          <div className="text-xs text-white/80">Plot #{selectedBuilding.plotIndex}</div>
          <div className="text-[11px] text-white/60 mt-0.5">{selectedBuilding.prompt}</div>
        </div>
      )}

      {nodeId === "capture" && latest?.screenshots && (
        <div>
          <div className="text-[10px] text-white/50 mb-1.5">Render Screenshots</div>
          <div className="grid grid-cols-2 gap-1">
            {(["front", "right", "back", "left"] as const).map((angle) => (
              <div key={angle} className="relative aspect-square rounded-lg overflow-hidden bg-black/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={latest.screenshots[angle]}
                  alt={angle}
                  className="w-full h-full object-cover"
                />
                <span className="absolute bottom-0.5 left-0.5 text-[8px] text-white/60 bg-black/40 px-1 rounded">
                  {angle}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {nodeId === "score" && latest && (
        <div>
          <div className="text-[10px] text-white/50 mb-1.5">Score Breakdown</div>
          <ScoreCard score={latest.score} />
          {latest.feedback && (
            <div className="mt-2 text-[9px] text-white/50 leading-relaxed line-clamp-4">
              {latest.feedback}
            </div>
          )}
        </div>
      )}

      {nodeId === "improve" && latest && (
        <div>
          <div className="text-[10px] text-white/50 mb-1.5">Improvement</div>
          <div className="flex items-center gap-1.5">
            <span className={`text-xs font-medium ${latest.improved ? "text-green-300" : "text-red-300"}`}>
              {latest.improved ? "Improved" : "No improvement"}
            </span>
          </div>
          {latest.feedback && (
            <div className="mt-1.5 text-[9px] text-white/50 leading-relaxed line-clamp-3">
              {latest.feedback}
            </div>
          )}
        </div>
      )}

      {nodeId === "update" && (
        <div>
          <div className="text-[10px] text-white/50 mb-1.5">Update</div>
          <div className="text-xs text-white/80">Saved to map</div>
          {iterations.length > 0 && (
            <div className="text-[10px] text-white/50 mt-0.5">
              {iterations.length} iteration{iterations.length !== 1 ? "s" : ""} complete
            </div>
          )}
        </div>
      )}

      {/* Fallback if no data yet */}
      {nodeId === "generate-views" && !multiView && (
        <div className="text-[10px] text-white/40">No views generated yet</div>
      )}
      {nodeId === "generate-code" && !selectedBuilding && (
        <div className="text-[10px] text-white/40">No code generated yet</div>
      )}
      {nodeId === "place-on-map" && !selectedBuilding && (
        <div className="text-[10px] text-white/40">Not placed yet</div>
      )}
      {nodeId === "capture" && !latest?.screenshots && (
        <div className="text-[10px] text-white/40">No captures yet</div>
      )}
      {nodeId === "score" && !latest && (
        <div className="text-[10px] text-white/40">No scores yet</div>
      )}
      {nodeId === "improve" && !latest && (
        <div className="text-[10px] text-white/40">No improvements yet</div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ScoreCard — compact score display for detail panel                  */
/* ------------------------------------------------------------------ */

function ScoreCard({ score }: { score: ScoreBreakdown }) {
  const dims = [
    { label: "Sil", val: score.silhouette },
    { label: "Prop", val: score.proportions },
    { label: "Feat", val: score.features },
    { label: "Mat", val: score.materials },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {dims.map((d) => (
          <div key={d.label} className="flex items-center gap-1">
            <span className="text-[9px] text-white/50 w-5">{d.label}</span>
            <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${scoreBarColor(d.val)}`}
                style={{ width: `${(d.val / 10) * 100}%` }}
              />
            </div>
            <span className={`text-[9px] font-semibold w-4 ${scoreTextColor(d.val)}`}>
              {d.val.toFixed(1)}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-white/10">
        <span className="text-[9px] text-white/50">Total</span>
        <span className={`text-xs font-bold ${scoreTextColor(score.totalScore)}`}>
          {score.totalScore.toFixed(1)}/10
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  NodePill — individual glass pill for each pipeline step             */
/* ------------------------------------------------------------------ */

function NodePill({
  node,
  isExpanded,
  onToggle,
  detailProps,
}: {
  node: { id: PipelineNodeId; label: string; status: NodeStatus; detail?: string };
  isExpanded: boolean;
  onToggle: () => void;
  detailProps: DetailPanelProps;
}) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-2xl border border-white/25 shadow-[0_8px_32px_rgba(0,0,0,0.3)] cursor-pointer hover:bg-white/20 transition-all duration-200 ${pillGlow(node.status)}`}
      >
        {/* Status dot */}
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotColor(node.status)}`} />
        {/* Icon */}
        <span className="text-white/70">
          <NodeIcon nodeId={node.id} />
        </span>
        {/* Label */}
        <span className="text-[11px] font-medium text-white/90 whitespace-nowrap">
          {node.label}
        </span>
      </button>

      {/* Detail panel */}
      {isExpanded && <NodeDetailPanel {...detailProps} nodeId={node.id} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  LoopBackLine — SVG curve on the right side (Capture -> Update)      */
/* ------------------------------------------------------------------ */

function LoopBackLine({ nodeCount, isActive }: { nodeCount: number; isActive: boolean }) {
  // Height per node row: pill (~36px) + connector (~12px) = ~48px
  // 4 iteration nodes: Capture, Score, Improve, Update
  const rowH = 48;
  const totalH = nodeCount * rowH;
  const pad = 18; // center of pill vertically
  const x = 8;
  const r = 8; // corner radius

  const top = pad;
  const bottom = totalH - pad;

  return (
    <svg
      className="absolute -right-5 top-0 pointer-events-none"
      width="20"
      height={totalH}
      fill="none"
    >
      <path
        d={`M ${x} ${bottom} L ${x} ${top + r} Q ${x} ${top} ${x - r} ${top}`}
        stroke="white"
        strokeOpacity={0.2}
        strokeWidth={1.5}
        strokeDasharray={isActive ? "4 3" : "none"}
        className={isActive ? "animate-dash" : ""}
        fill="none"
      />
      {/* Arrow pointing left at top */}
      <path
        d={`M ${x - r + 4} ${top - 3} L ${x - r} ${top} L ${x - r + 4} ${top + 3}`}
        stroke="white"
        strokeOpacity={0.3}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  IterationCounterPill                                                */
/* ------------------------------------------------------------------ */

function IterationCounterPill({
  current,
  max,
}: {
  current: number;
  max: number;
}) {
  const pct = max > 0 ? Math.min((current / max) * 100, 100) : 0;

  return (
    <div className="px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-2xl border border-white/25 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-white/60 font-medium">
          Iteration {current} / {max}
        </span>
      </div>
      <div className="h-1 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-400/60 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ScorePill                                                           */
/* ------------------------------------------------------------------ */

function ScorePill({ score }: { score: ScoreBreakdown }) {
  const dims = [
    { label: "Sil", val: score.silhouette },
    { label: "Prop", val: score.proportions },
    { label: "Feat", val: score.features },
    { label: "Mat", val: score.materials },
  ];

  return (
    <div className="px-3 py-2 rounded-2xl bg-white/15 backdrop-blur-2xl border border-white/25 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-white/50">Score</span>
        <span className={`text-sm font-bold ${scoreTextColor(score.totalScore)}`}>
          {score.totalScore.toFixed(1)}/10
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {dims.map((d) => (
          <div key={d.label} className="flex items-center gap-1">
            <span className="text-[9px] text-white/50 w-5">{d.label}</span>
            <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${scoreBarColor(d.val)}`}
                style={{ width: `${(d.val / 10) * 100}%` }}
              />
            </div>
            <span className={`text-[9px] font-semibold w-4 ${scoreTextColor(d.val)}`}>
              {d.val.toFixed(1)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ControlsPill — pause/stop/minimize (only when active)               */
/* ------------------------------------------------------------------ */

function ControlsPill({
  isPaused,
  onTogglePause,
  onStop,
  onMinimize,
}: {
  isPaused: boolean;
  onTogglePause: () => void;
  onStop: () => void;
  onMinimize: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5 px-2 py-1 rounded-full bg-white/15 backdrop-blur-2xl border border-white/25 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
      <button
        onClick={onTogglePause}
        className="p-1 rounded-full hover:bg-white/10 transition-colors"
        title={isPaused ? "Resume" : "Pause"}
      >
        {isPaused ? (
          <svg className="w-3.5 h-3.5 text-green-300" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5 text-yellow-300" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
          </svg>
        )}
      </button>
      <button
        onClick={onStop}
        className="p-1 rounded-full hover:bg-white/10 transition-colors"
        title="Stop"
      >
        <svg className="w-3.5 h-3.5 text-red-300" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 6h12v12H6z" />
        </svg>
      </button>
      <button
        onClick={onMinimize}
        className="p-1 rounded-full hover:bg-white/10 transition-colors"
        title="Minimize"
      >
        <svg className="w-3.5 h-3.5 text-white/50" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
        </svg>
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Summary pill (minimized state)                                      */
/* ------------------------------------------------------------------ */

export function PipelineSummaryPill({ onExpand }: { onExpand: () => void }) {
  const latestScore = usePipelineStore((s) => s.latestScore);
  const iterationCount = usePipelineStore((s) => s.iterationCount);
  const isActive = usePipelineStore((s) => s.isActive);

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 bg-white/15 backdrop-blur-2xl rounded-full border border-white/25 shadow-[0_8px_32px_rgba(0,0,0,0.3)] cursor-pointer hover:bg-white/20 transition-colors"
      onClick={onExpand}
    >
      <div
        className={`w-2 h-2 rounded-full ${
          isActive ? "bg-blue-400 animate-pulse" : "bg-green-400"
        }`}
      />
      <span className="text-[11px] text-white/80 font-medium">Pipeline</span>
      {latestScore && (
        <span className={`text-[11px] font-bold ${scoreTextColor(latestScore.totalScore)}`}>
          {latestScore.totalScore.toFixed(1)}
        </span>
      )}
      {iterationCount > 0 && (
        <span className="text-[10px] text-white/40">#{iterationCount}</span>
      )}
      <svg className="w-3 h-3 text-white/50" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main flowchart — individual glass pills with loop-back              */
/* ------------------------------------------------------------------ */

export interface PipelineFlowchartProps {
  onMinimize: () => void;
  onStop: () => void;
  onTogglePause: () => void;
  multiView: MultiViewImages | null;
  iterations: IterationResult[];
  selectedBuilding: {
    proceduralCode: string;
    prompt: string;
    plotIndex: number;
  } | null;
}

export default function PipelineFlowchart({
  onMinimize,
  onStop,
  onTogglePause,
  multiView,
  iterations,
  selectedBuilding,
}: PipelineFlowchartProps) {
  const nodes = usePipelineStore((s) => s.nodes);
  const isActive = usePipelineStore((s) => s.isActive);
  const isPaused = usePipelineStore((s) => s.isPaused);
  const iterationCount = usePipelineStore((s) => s.iterationCount);
  const maxIterations = usePipelineStore((s) => s.maxIterations);
  const latestScore = usePipelineStore((s) => s.latestScore);
  const error = usePipelineStore((s) => s.error);

  const [expandedNode, setExpandedNode] = useState<PipelineNodeId | null>(null);

  const toggleNode = (id: PipelineNodeId) => {
    setExpandedNode((prev) => (prev === id ? null : id));
  };

  // Split into generation nodes (first 3) and iteration nodes (last 4)
  const genNodes = nodes.slice(0, 3);
  const iterNodes = nodes.slice(3);

  const detailProps: Omit<DetailPanelProps, "nodeId"> = {
    multiView,
    iterations,
    selectedBuilding,
  };

  const hasIterations = iterationCount > 0;
  const iterationIsActive = iterNodes.some((n) => n.status === "active");

  return (
    <div className="flex flex-col gap-2 animate-slide-in-left">
      {/* Controls pill — only when active */}
      {isActive && (
        <ControlsPill
          isPaused={isPaused}
          onTogglePause={onTogglePause}
          onStop={onStop}
          onMinimize={onMinimize}
        />
      )}

      {/* Minimize button when not active (no controls pill) */}
      {!isActive && (
        <div className="flex">
          <button
            onClick={onMinimize}
            className="p-1.5 rounded-full bg-white/15 backdrop-blur-2xl border border-white/25 shadow-[0_8px_32px_rgba(0,0,0,0.3)] hover:bg-white/20 transition-colors"
            title="Minimize"
          >
            <svg className="w-3.5 h-3.5 text-white/50" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
            </svg>
          </button>
        </div>
      )}

      {/* Generation nodes */}
      {genNodes.map((node, i) => (
        <div key={node.id}>
          {i > 0 && <VerticalConnector status={node.status} />}
          <NodePill
            node={node}
            isExpanded={expandedNode === node.id}
            onToggle={() => toggleNode(node.id)}
            detailProps={{ ...detailProps, nodeId: node.id }}
          />
        </div>
      ))}

      {/* Connector from generation to iteration */}
      <VerticalConnector status={iterNodes[0].status} />

      {/* Iteration nodes with loop-back line */}
      <div className="relative">
        {/* Loop-back line on the right side */}
        {hasIterations && (
          <LoopBackLine nodeCount={4} isActive={iterationIsActive} />
        )}

        {/* Iteration node pills */}
        {iterNodes.map((node, i) => (
          <div key={node.id}>
            {i > 0 && <VerticalConnector status={node.status} />}
            <NodePill
              node={node}
              isExpanded={expandedNode === node.id}
              onToggle={() => toggleNode(node.id)}
              detailProps={{ ...detailProps, nodeId: node.id }}
            />
          </div>
        ))}
      </div>

      {/* Iteration counter pill */}
      {hasIterations && (
        <IterationCounterPill current={iterationCount} max={maxIterations} />
      )}

      {/* Score pill */}
      {latestScore && <ScorePill score={latestScore} />}

      {/* Error */}
      {error && (
        <div className="px-3 py-1.5 rounded-full bg-red-400/15 backdrop-blur-2xl border border-red-400/25 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
          <div className="text-[10px] text-red-300/80 truncate">{error}</div>
        </div>
      )}
    </div>
  );
}
