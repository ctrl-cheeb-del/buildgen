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
/*  Pod status styling (glass-adapted)                                 */
/* ------------------------------------------------------------------ */

function podStyle(status: NodeStatus) {
  switch (status) {
    case "pending":
      return "bg-white/10 border-white/20 text-white/40";
    case "active":
      return "bg-blue-400/25 border-blue-400/50 text-blue-200 animate-glow";
    case "done":
      return "bg-green-400/25 border-green-400/50 text-green-200";
    case "error":
      return "bg-red-400/25 border-red-400/50 text-red-200";
  }
}

function connectorColor(status: NodeStatus) {
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
/*  Score bar (glass-adapted)                                          */
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
    <div className="px-3 pb-3">
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {dims.map((d) => (
          <div key={d.label} className="flex items-center gap-1.5">
            <span className="text-[10px] text-white/50 w-6">{d.label}</span>
            <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
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
      </div>
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/10">
        <span className="text-[10px] text-white/50">Total</span>
        <span className={`text-sm font-bold ${scoreTextColor(latestScore.totalScore)}`}>
          {latestScore.totalScore.toFixed(1)}/10
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  VerticalNode — 40px circle + icon + label row                      */
/* ------------------------------------------------------------------ */

function VerticalNode({
  node,
}: {
  node: { id: PipelineNodeId; label: string; status: NodeStatus; detail?: string };
}) {
  return (
    <div className="flex items-center gap-2.5 py-0.5">
      <div
        className={`w-8 h-8 rounded-full border flex-shrink-0 flex items-center justify-center transition-all duration-300 ${podStyle(node.status)}`}
      >
        {node.status === "done" ? (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        ) : node.status === "error" ? (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <NodeIcon nodeId={node.id} />
        )}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-medium text-white/90 leading-tight">
          {node.label}
        </div>
        {node.detail && node.status === "active" && (
          <div className="text-[9px] text-white/40 truncate">{node.detail}</div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  VerticalConnector — 2px × 16px vertical line                       */
/* ------------------------------------------------------------------ */

function VerticalConnector({ status }: { status: NodeStatus }) {
  return (
    <div className="flex items-center pl-[15px]">
      <div className={`w-[2px] h-4 rounded-full ${connectorColor(status)}`} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Summary pill (minimized state)                                     */
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
/*  Main flowchart — vertical liquid glass panel                       */
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
    <div className="w-64 bg-white/15 backdrop-blur-2xl rounded-2xl border border-white/25 shadow-[0_8px_32px_rgba(0,0,0,0.3)] animate-slide-in-right overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-white/90">Pipeline</span>
          {iterationCount > 0 && (
            <span className="text-[10px] text-white/50">
              {iterationCount}/{maxIterations}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {isActive && (
            <>
              <button
                onClick={onTogglePause}
                className="p-1 rounded hover:bg-white/10 transition-colors"
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
                className="p-1 rounded hover:bg-white/10 transition-colors"
                title="Stop"
              >
                <svg className="w-3.5 h-3.5 text-red-300" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 6h12v12H6z" />
                </svg>
              </button>
            </>
          )}
          <button
            onClick={onMinimize}
            className="p-1 rounded hover:bg-white/10 transition-colors"
            title="Minimize"
          >
            <svg className="w-3.5 h-3.5 text-white/50" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Iteration subtitle */}
      {iterationCount > 0 && (
        <div className="px-3 pt-1.5">
          <span className="text-[10px] text-white/40">
            Iteration {iterationCount} of {maxIterations}
          </span>
        </div>
      )}

      {/* Generation nodes */}
      <div className="px-3 pt-2">
        {genNodes.map((node, i) => (
          <div key={node.id}>
            {i > 0 && <VerticalConnector status={node.status} />}
            <VerticalNode node={node} />
          </div>
        ))}
      </div>

      {/* Connector to iteration loop */}
      <div className="px-3">
        <VerticalConnector status={iterNodes[0].status} />
      </div>

      {/* Iteration loop container */}
      <div className="mx-3 mb-2 relative">
        <div className="border border-white/10 rounded-lg pl-3 pr-2 py-1.5 bg-white/5">
          {/* Loop label */}
          <div className="flex items-center gap-1.5 mb-1">
            <svg className="w-3 h-3 text-white/30" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
            </svg>
            <span className="text-[9px] text-white/30 uppercase tracking-wider font-medium">
              Iteration Loop
            </span>
          </div>

          {iterNodes.map((node, i) => (
            <div key={node.id}>
              {i > 0 && <VerticalConnector status={node.status} />}
              <VerticalNode node={node} />
            </div>
          ))}

          {/* Loop-back indicator */}
          {iterationCount > 0 && (
            <div className="flex items-center gap-1 mt-1 pt-1 border-t border-white/10">
              <svg className="w-3 h-3 text-white/25" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
              </svg>
              <span className="text-[9px] text-white/25">repeat</span>
            </div>
          )}
        </div>
      </div>

      {/* Score bar */}
      <ScoreBar />

      {/* Error */}
      {error && (
        <div className="px-3 pb-2">
          <div className="text-[10px] text-red-300/80 truncate">{error}</div>
        </div>
      )}
    </div>
  );
}
