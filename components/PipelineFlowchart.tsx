"use client";

import { useState } from "react";
import {
  usePipelineStore,
  type PipelineNodeId,
  type NodeStatus,
} from "@/lib/stores/pipeline-store";
import type {
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
/*  Shared glass pill class (no heavy shadow)                           */
/* ------------------------------------------------------------------ */

const GLASS_PILL =
  "bg-white/15 backdrop-blur-2xl border border-white/25 shadow-[0_2px_8px_rgba(0,0,0,0.15)]";

/* ------------------------------------------------------------------ */
/*  Status helpers                                                      */
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
  return status === "active" ? "animate-glow" : "";
}

function connectorGlassColor(status: NodeStatus): string {
  switch (status) {
    case "done":
      return "bg-green-400/40 shadow-[0_0_6px_rgba(74,222,128,0.3)]";
    case "active":
      return "bg-blue-400/40 shadow-[0_0_6px_rgba(96,165,250,0.3)]";
    case "error":
      return "bg-red-400/40 shadow-[0_0_6px_rgba(248,113,113,0.3)]";
    default:
      return "bg-white/20";
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
/*  GlassConnector — liquid glass vertical line                         */
/* ------------------------------------------------------------------ */

function GlassConnector({ status }: { status: NodeStatus }) {
  return (
    <div className="flex items-center pl-[18px] py-[3px]">
      <div
        className={`w-[3px] h-3.5 rounded-full ${connectorGlassColor(status)}`}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  NodeDetailPanel                                                     */
/* ------------------------------------------------------------------ */

interface DetailPanelProps {
  nodeId: PipelineNodeId;
  nodeStatus: NodeStatus;
  nodeDetail?: string;
  multiViewUrl: string | null;
  iterations: IterationResult[];
  latestScore: ScoreBreakdown | null;
  selectedBuilding: {
    proceduralCode: string;
    prompt: string;
    plotIndex: number;
  } | null;
}

function StatusBadge({ status, text }: { status: NodeStatus; text: string }) {
  const color =
    status === "done"
      ? "text-green-300"
      : status === "active"
        ? "text-blue-300"
        : status === "error"
          ? "text-red-300"
          : "text-white/50";
  const icon =
    status === "done" ? "\u2713" : status === "active" ? "\u2022" : "";

  return (
    <span className={`text-xs font-medium ${color}`}>
      {icon} {text}
    </span>
  );
}

function NodeDetailPanel({
  nodeId,
  nodeStatus,
  nodeDetail,
  multiViewUrl,
  iterations,
  latestScore,
  selectedBuilding,
}: DetailPanelProps) {
  const latest =
    iterations.length > 0 ? iterations[iterations.length - 1] : null;
  const currentScreenshots = usePipelineStore((s) => s.currentScreenshots);

  const isDone = nodeStatus === "done";
  const isActive = nodeStatus === "active";

  return (
    <div
      className={`absolute left-full ml-2 top-0 w-56 rounded-2xl ${GLASS_PILL} p-3 z-50 animate-fade-in`}
    >
      {/* Generate Views — show grid image from Convex storage */}
      {nodeId === "generate-views" &&
        (multiViewUrl && multiViewUrl !== "reused" ? (
          <div>
            <div className="text-[10px] text-white/50 mb-1.5">
              Blueprint Views
            </div>
            <div className="rounded-lg overflow-hidden bg-black/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={multiViewUrl}
                alt="Multi-view grid"
                className="w-full h-auto object-cover"
              />
            </div>
          </div>
        ) : multiViewUrl === "reused" || (isDone && !multiViewUrl) ? (
          <StatusBadge status="done" text="Reused existing design" />
        ) : isActive ? (
          <StatusBadge status="active" text="Generating views..." />
        ) : (
          <div className="text-[10px] text-white/40">Waiting</div>
        ))}

      {/* Generate Code — simple success message */}
      {nodeId === "generate-code" &&
        (isDone ? (
          <StatusBadge status="done" text="Code generated" />
        ) : isActive ? (
          <StatusBadge status="active" text={nodeDetail || "Generating..."} />
        ) : (
          <div className="text-[10px] text-white/40">Waiting</div>
        ))}

      {/* Place on Map — simple success message */}
      {nodeId === "place-on-map" &&
        (isDone ? (
          <StatusBadge status="done" text="Placed on map" />
        ) : isActive ? (
          <StatusBadge status="active" text={nodeDetail || "Placing..."} />
        ) : (
          <div className="text-[10px] text-white/40">Waiting</div>
        ))}

      {/* Capture — show screenshots from current capture or latest iteration */}
      {nodeId === "capture" &&
        (() => {
          const shots = currentScreenshots ?? latest?.screenshots ?? null;
          return shots ? (
            <div>
              <div className="text-[10px] text-white/50 mb-1.5">
                Render Screenshots
              </div>
              <div className="grid grid-cols-2 gap-1">
                {(["front", "right", "back", "left"] as const).map((angle) => (
                  <div
                    key={angle}
                    className="relative aspect-square rounded-lg overflow-hidden bg-black/30"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={shots[angle]}
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
          ) : isActive ? (
            <StatusBadge status="active" text={nodeDetail || "Capturing..."} />
          ) : isDone ? (
            <StatusBadge status="done" text={nodeDetail || "Captured"} />
          ) : (
            <div className="text-[10px] text-white/40">Waiting</div>
          );
        })()}

      {/* Score — show score card from latest iteration or live latestScore, or status */}
      {nodeId === "score" &&
        (latest ? (
          <div>
            <div className="text-[10px] text-white/50 mb-1.5">
              Score Breakdown
            </div>
            <ScoreCard score={latest.score} />
            {latest.feedback && (
              <div className="mt-2 text-[9px] text-white/50 leading-relaxed line-clamp-4">
                {latest.feedback}
              </div>
            )}
          </div>
        ) : latestScore ? (
          <div>
            <div className="text-[10px] text-white/50 mb-1.5">
              Score Breakdown
            </div>
            <ScoreCard score={latestScore} />
          </div>
        ) : isDone ? (
          <StatusBadge status="done" text="Scored" />
        ) : isActive ? (
          <StatusBadge status="active" text={nodeDetail || "Scoring..."} />
        ) : (
          <div className="text-[10px] text-white/40">Waiting</div>
        ))}

      {/* Improve — show improvement result or live status */}
      {nodeId === "improve" &&
        (latest ? (
          <div>
            <div className="text-[10px] text-white/50 mb-1.5">Improvement</div>
            <span
              className={`text-xs font-medium ${latest.improved ? "text-green-300" : "text-red-300"}`}
            >
              {latest.improved ? "\u2713 Improved" : "\u2717 No improvement"}
            </span>
            {latest.feedback && (
              <div className="mt-1.5 text-[9px] text-white/50 leading-relaxed line-clamp-3">
                {latest.feedback}
              </div>
            )}
          </div>
        ) : isDone ? (
          <StatusBadge status="done" text="Applied" />
        ) : isActive ? (
          <StatusBadge status="active" text={nodeDetail || "Improving..."} />
        ) : (
          <div className="text-[10px] text-white/40">Waiting</div>
        ))}

      {/* Update — show save confirmation */}
      {nodeId === "update" &&
        (isDone || iterations.length > 0 ? (
          <div>
            <StatusBadge status="done" text="Saved to map" />
            {iterations.length > 0 && (
              <div className="text-[10px] text-white/50 mt-0.5">
                {iterations.length} iteration
                {iterations.length !== 1 ? "s" : ""} complete
              </div>
            )}
          </div>
        ) : isActive ? (
          <StatusBadge status="active" text={nodeDetail || "Saving..."} />
        ) : (
          <div className="text-[10px] text-white/40">Waiting</div>
        ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ScoreCard                                                           */
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
            <span
              className={`text-[9px] font-semibold w-4 ${scoreTextColor(d.val)}`}
            >
              {d.val.toFixed(1)}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-white/10">
        <span className="text-[9px] text-white/50">Total</span>
        <span
          className={`text-xs font-bold ${scoreTextColor(score.totalScore)}`}
        >
          {score.totalScore.toFixed(1)}/10
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  NodePill                                                            */
/* ------------------------------------------------------------------ */

function NodePill({
  node,
  isExpanded,
  onToggle,
  detailProps,
}: {
  node: {
    id: PipelineNodeId;
    label: string;
    status: NodeStatus;
    detail?: string;
  };
  isExpanded: boolean;
  onToggle: () => void;
  detailProps: DetailPanelProps;
}) {
  return (
    <div className="relative w-fit">
      <button
        onClick={onToggle}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${GLASS_PILL} cursor-pointer hover:bg-white/20 transition-all duration-200 ${pillGlow(node.status)}`}
      >
        <div
          className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotColor(node.status)}`}
        />
        <span className="text-white/70">
          <NodeIcon nodeId={node.id} />
        </span>
        <span className="text-[11px] font-medium text-white/90 whitespace-nowrap">
          {node.label}
        </span>
      </button>
      {isExpanded && <NodeDetailPanel {...detailProps} nodeId={node.id} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  LoopBackLine — CSS vertical bar on right side of iteration nodes    */
/* ------------------------------------------------------------------ */

function LoopBackLine({ isAnimating }: { isAnimating: boolean }) {
  return (
    <div
      className={`absolute -right-3 top-3 bottom-3 pointer-events-none flex flex-col items-center ${
        isAnimating ? "animate-loop-glow" : ""
      }`}
    >
      {/* Arrow pointing up at top */}
      <svg
        className="w-2.5 h-2.5 flex-shrink-0 -mb-px"
        viewBox="0 0 10 10"
        fill="none"
      >
        <path
          d="M2 7 L5 3 L8 7"
          stroke="rgba(96, 165, 250, 0.7)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {/* Vertical line that stretches to fill */}
      <div
        className={`flex-1 w-[2.5px] rounded-full ${
          isAnimating
            ? "bg-blue-400/50 shadow-[0_0_6px_rgba(96,165,250,0.3)]"
            : "bg-blue-400/25"
        }`}
      />
    </div>
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
    <div className={`w-fit px-3 py-1.5 rounded-full ${GLASS_PILL}`}>
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
    <div className={`w-fit px-3 py-2 rounded-2xl ${GLASS_PILL}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-white/50">Score</span>
        <span
          className={`text-sm font-bold ml-3 ${scoreTextColor(score.totalScore)}`}
        >
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
            <span
              className={`text-[9px] font-semibold w-4 ${scoreTextColor(d.val)}`}
            >
              {d.val.toFixed(1)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ControlsPill and PipelineSummaryPill removed — merged into main PipelineFlowchart header */

/* ------------------------------------------------------------------ */
/*  Main flowchart                                                      */
/* ------------------------------------------------------------------ */

export interface PipelineFlowchartProps {
  isMinimized: boolean;
  onToggleMinimize: () => void;
  onStop: () => void;
  onTogglePause: () => void;
  multiViewUrl: string | null;
  iterations: IterationResult[];
  selectedBuilding: {
    proceduralCode: string;
    prompt: string;
    plotIndex: number;
  } | null;
}

export default function PipelineFlowchart({
  isMinimized,
  onToggleMinimize,
  onStop,
  onTogglePause,
  multiViewUrl,
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
  const retryCount = usePipelineStore((s) => s.retryCount);
  const maxRetries = usePipelineStore((s) => s.maxRetries);

  const [expandedNode, setExpandedNode] = useState<PipelineNodeId | null>(null);

  const toggleNode = (id: PipelineNodeId) => {
    setExpandedNode((prev) => (prev === id ? null : id));
  };

  const genNodes = nodes.slice(0, 3);
  const iterNodes = nodes.slice(3);

  const makeDetailProps = (
    node: { id: PipelineNodeId; status: NodeStatus; detail?: string },
  ): DetailPanelProps => ({
    nodeId: node.id,
    nodeStatus: node.status,
    nodeDetail: node.detail,
    multiViewUrl,
    iterations,
    latestScore,
    selectedBuilding,
  });

  const hasIterations = iterationCount > 0;

  // Find which iteration node is currently active (for loop-back line)
  const activeIterIndex = iterNodes.findIndex((n) => n.status === "active");

  return (
    <div className="flex flex-col items-start">
      {/* Header pill — always visible, acts as toggle */}
      <div className="flex items-center gap-1.5">
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${GLASS_PILL} cursor-pointer hover:bg-white/20 transition-colors`}
          onClick={onToggleMinimize}
        >
          <div
            className={`w-2 h-2 rounded-full ${
              isActive ? "bg-blue-400 animate-pulse" : "bg-green-400"
            }`}
          />
          <span className="text-[11px] text-white/80 font-medium">
            Pipeline
          </span>
          {latestScore && (
            <span
              className={`text-[11px] font-bold ${scoreTextColor(latestScore.totalScore)}`}
            >
              {latestScore.totalScore.toFixed(1)}
            </span>
          )}
          {iterationCount > 0 && (
            <span className="text-[10px] text-white/40">
              #{iterationCount}
            </span>
          )}
          <svg
            className={`w-3 h-3 text-white/50 transition-transform duration-200 ${
              isMinimized ? "" : "rotate-90"
            }`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.25 4.5l7.5 7.5-7.5 7.5"
            />
          </svg>
        </div>

        {/* Inline controls when active (always visible, even minimized) */}
        {isActive && (
          <div className="flex items-center gap-0.5 animate-fade-in">
            <button
              onClick={onTogglePause}
              className={`p-1 rounded-full ${GLASS_PILL} hover:bg-white/20 transition-colors`}
              title={isPaused ? "Resume" : "Pause"}
            >
              {isPaused ? (
                <svg
                  className="w-3.5 h-3.5 text-green-300"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              ) : (
                <svg
                  className="w-3.5 h-3.5 text-yellow-300"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
              )}
            </button>
            <button
              onClick={onStop}
              className={`p-1 rounded-full ${GLASS_PILL} hover:bg-white/20 transition-colors`}
              title="Stop"
            >
              <svg
                className="w-3.5 h-3.5 text-red-300"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M6 6h12v12H6z" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Expandable content — nodes, connectors, scores */}
      {!isMinimized && (
        <div className="flex flex-col items-start animate-expand-down">
          <GlassConnector status={genNodes[0].status} />

          {/* Generation nodes */}
          {genNodes.map((node, i) => (
            <div key={node.id} className="flex flex-col items-start">
              <NodePill
                node={node}
                isExpanded={expandedNode === node.id}
                onToggle={() => toggleNode(node.id)}
                detailProps={makeDetailProps(node)}
              />
              <GlassConnector
                status={
                  i < genNodes.length - 1
                    ? genNodes[i + 1].status
                    : iterNodes[0].status
                }
              />
            </div>
          ))}

          {/* Iteration nodes with loop-back line */}
          <div className="relative flex flex-col items-start pr-8">
            {hasIterations && (
              <LoopBackLine isAnimating={activeIterIndex >= 0} />
            )}

            {iterNodes.map((node, i) => (
              <div key={node.id} className="flex flex-col items-start">
                <NodePill
                  node={node}
                  isExpanded={expandedNode === node.id}
                  onToggle={() => toggleNode(node.id)}
                  detailProps={makeDetailProps(node)}
                />
                {i < iterNodes.length - 1 && (
                  <GlassConnector status={iterNodes[i + 1].status} />
                )}
              </div>
            ))}
          </div>

          {/* Iteration counter pill */}
          {hasIterations && (
            <>
              <GlassConnector status="done" />
              <IterationCounterPill
                current={iterationCount}
                max={maxIterations}
              />
            </>
          )}

          {/* Score pill */}
          {latestScore && (
            <>
              <GlassConnector status="done" />
              <ScorePill score={latestScore} />
            </>
          )}

          {/* Retry / Error */}
          {retryCount > 0 && retryCount < maxRetries && (
            <>
              <GlassConnector status="active" />
              <div className="w-fit px-3 py-1.5 rounded-full bg-amber-400/15 backdrop-blur-2xl border border-amber-400/25 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
                <div className="text-[10px] text-amber-300/80 truncate max-w-[180px]">
                  Build failed — Retrying ({retryCount}/{maxRetries})
                </div>
              </div>
            </>
          )}
          {error && !(retryCount > 0 && retryCount < maxRetries) && (
            <>
              <GlassConnector status="error" />
              <div className="w-fit px-3 py-1.5 rounded-full bg-red-400/15 backdrop-blur-2xl border border-red-400/25 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
                <div className="text-[10px] text-red-300/80 truncate max-w-[180px]">
                  {error}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
