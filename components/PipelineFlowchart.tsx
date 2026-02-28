"use client";

import {
  usePipelineStore,
  type PipelineNodeId,
  type NodeStatus,
} from "@/lib/stores/pipeline-store";

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
/*  Node icon                                                          */
/* ------------------------------------------------------------------ */

function NodeIcon({ nodeId }: { nodeId: PipelineNodeId }) {
  return (
    <svg
      className="w-5 h-5"
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
/*  Node status styling                                                */
/* ------------------------------------------------------------------ */

function nodeStyle(status: NodeStatus) {
  switch (status) {
    case "pending":
      return "bg-white border-gray-200 text-gray-400";
    case "active":
      return "bg-blue-50 border-blue-400 text-blue-700 animate-glow";
    case "done":
      return "bg-green-50 border-green-400 text-green-700";
    case "error":
      return "bg-red-50 border-red-400 text-red-700";
  }
}

function connectorColor(status: NodeStatus) {
  switch (status) {
    case "done":
      return "stroke-green-400";
    case "active":
      return "stroke-blue-400 animate-dash";
    case "error":
      return "stroke-red-400";
    default:
      return "stroke-gray-200";
  }
}

/* ------------------------------------------------------------------ */
/*  Score bar                                                          */
/* ------------------------------------------------------------------ */

function scoreBarColor(score: number): string {
  if (score >= 7) return "bg-green-500";
  if (score >= 4) return "bg-yellow-500";
  return "bg-red-500";
}

function scoreTextColor(score: number): string {
  if (score >= 7) return "text-green-600";
  if (score >= 4) return "text-yellow-600";
  return "text-red-600";
}

function ScoreBar() {
  const latestScore = usePipelineStore((s) => s.latestScore);
  if (!latestScore) return null;

  const dims = [
    { label: "Sil", val: latestScore.silhouette },
    { label: "Prop", val: latestScore.proportions },
    { label: "Feat", val: latestScore.features },
    { label: "Mat", val: latestScore.materials },
  ];

  return (
    <div className="flex items-center gap-3">
      {dims.map((d) => (
        <div key={d.label} className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-500 w-7">{d.label}</span>
          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${scoreBarColor(d.val)}`}
              style={{ width: `${(d.val / 10) * 100}%` }}
            />
          </div>
          <span className={`text-[10px] font-semibold w-5 ${scoreTextColor(d.val)}`}>
            {d.val.toFixed(1)}
          </span>
        </div>
      ))}
      <div className="ml-2 pl-2 border-l border-gray-200 flex items-center gap-1">
        <span className="text-xs text-gray-500">Total</span>
        <span className={`text-sm font-bold ${scoreTextColor(latestScore.totalScore)}`}>
          {latestScore.totalScore.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Summary bar (minimized state)                                      */
/* ------------------------------------------------------------------ */

export function PipelineSummaryBar({ onExpand }: { onExpand: () => void }) {
  const latestScore = usePipelineStore((s) => s.latestScore);
  const iterationCount = usePipelineStore((s) => s.iterationCount);
  const isActive = usePipelineStore((s) => s.isActive);

  return (
    <div
      className="flex items-center justify-between px-4 py-2 bg-white/95 backdrop-blur-sm border-t border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors"
      onClick={onExpand}
    >
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500">
          {isActive ? "Pipeline running" : "Pipeline complete"} — Iteration{" "}
          {iterationCount}
        </span>
        {latestScore && (
          <span className={`text-xs font-bold ${scoreTextColor(latestScore.totalScore)}`}>
            Score: {latestScore.totalScore.toFixed(1)}/10
          </span>
        )}
      </div>
      <button className="text-xs text-blue-600 hover:text-blue-800 font-medium">
        Expand
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main flowchart                                                     */
/* ------------------------------------------------------------------ */

export default function PipelineFlowchart({
  onMinimize,
  onStop,
  onTogglePause,
}: {
  onMinimize: () => void;
  onStop: () => void;
  onTogglePause: () => void;
}) {
  const nodes = usePipelineStore((s) => s.nodes);
  const isActive = usePipelineStore((s) => s.isActive);
  const isPaused = usePipelineStore((s) => s.isPaused);
  const iterationCount = usePipelineStore((s) => s.iterationCount);
  const maxIterations = usePipelineStore((s) => s.maxIterations);
  const error = usePipelineStore((s) => s.error);

  // Split into generation nodes (first 3) and iteration nodes (last 4)
  const genNodes = nodes.slice(0, 3);
  const iterNodes = nodes.slice(3);

  return (
    <div className="bg-white/95 backdrop-blur-sm border-t border-gray-200 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-700">Pipeline</span>
          {iterationCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-blue-100 text-[10px] font-medium text-blue-700">
              Iteration {iterationCount} / {maxIterations}
            </span>
          )}
          {error && (
            <span className="px-2 py-0.5 rounded-full bg-red-100 text-[10px] font-medium text-red-700">
              Error
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isActive && (
            <>
              <button
                onClick={onTogglePause}
                className={`px-2.5 py-1 text-[10px] font-medium rounded transition-colors ${
                  isPaused
                    ? "text-green-700 bg-green-100 hover:bg-green-200"
                    : "text-yellow-700 bg-yellow-100 hover:bg-yellow-200"
                }`}
              >
                {isPaused ? "Resume" : "Pause"}
              </button>
              <button
                onClick={onStop}
                className="px-2.5 py-1 text-[10px] font-medium text-red-700 bg-red-100 rounded hover:bg-red-200 transition-colors"
              >
                Stop
              </button>
            </>
          )}
          <button
            onClick={onMinimize}
            className="px-2.5 py-1 text-[10px] font-medium text-gray-500 hover:text-gray-700 transition-colors"
          >
            Minimize
          </button>
        </div>
      </div>

      {/* Flowchart */}
      <div className="px-4 py-3 overflow-x-auto">
        <div className="flex items-center gap-0 min-w-max">
          {/* Generation nodes */}
          {genNodes.map((node, i) => (
            <div key={node.id} className="flex items-center">
              {i > 0 && <Connector status={node.status} />}
              <FlowNode node={node} size="large" />
            </div>
          ))}

          {/* Separator arrow to iteration loop */}
          <Connector status={iterNodes[0].status} />

          {/* Iteration loop container */}
          <div className="relative flex items-center">
            {iterNodes.map((node, i) => (
              <div key={node.id} className="flex items-center">
                {i > 0 && <Connector status={node.status} />}
                <FlowNode node={node} size="small" />
              </div>
            ))}

            {/* Loop-back arrow */}
            {iterationCount > 0 && (
              <svg
                className="absolute -bottom-5 left-0 right-0"
                height="24"
                viewBox="0 0 100 24"
                preserveAspectRatio="none"
                fill="none"
              >
                <path
                  d="M95 2 C95 18, 50 22, 5 18 L5 14"
                  stroke="#9CA3AF"
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                  fill="none"
                  markerEnd="url(#arrowhead)"
                />
                <defs>
                  <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                    <polygon points="0 0, 6 2, 0 4" fill="#9CA3AF" />
                  </marker>
                </defs>
              </svg>
            )}
          </div>
        </div>
      </div>

      {/* Score bar + error */}
      <div className="px-4 pb-2.5 flex items-center justify-between gap-4">
        <ScoreBar />
        {error && (
          <div className="text-[10px] text-red-600 truncate max-w-xs">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function FlowNode({
  node,
  size,
}: {
  node: { id: PipelineNodeId; label: string; status: NodeStatus; detail?: string };
  size: "large" | "small";
}) {
  const w = size === "large" ? "w-[130px]" : "w-[110px]";
  const h = size === "large" ? "h-[76px]" : "h-[68px]";

  return (
    <div
      className={`${w} ${h} flex flex-col items-center justify-center gap-1 rounded-lg border-2 ${nodeStyle(node.status)} transition-all duration-300 relative`}
    >
      {/* Status badge */}
      {node.status === "done" && (
        <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
      )}
      {node.status === "error" && (
        <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
      )}

      <NodeIcon nodeId={node.id} />
      <span className="text-[10px] font-medium leading-tight text-center px-1">
        {node.label}
      </span>
      {node.detail && node.status === "active" && (
        <span className="text-[8px] opacity-70 truncate max-w-full px-1">
          {node.detail}
        </span>
      )}
    </div>
  );
}

function Connector({ status }: { status: NodeStatus }) {
  const color = connectorColor(status);
  const isDash = status === "active";
  return (
    <svg width="32" height="12" viewBox="0 0 32 12" className="flex-shrink-0">
      <line
        x1="0"
        y1="6"
        x2="24"
        y2="6"
        className={color}
        strokeWidth="2"
        strokeDasharray={isDash ? "6 4" : "none"}
      />
      <polygon points="24,2 32,6 24,10" className={`fill-current ${color.replace("stroke-", "text-")}`} />
    </svg>
  );
}
