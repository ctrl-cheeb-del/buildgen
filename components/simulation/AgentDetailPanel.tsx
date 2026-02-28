"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

interface AgentDetailPanelProps {
  plotIndex: number | null;
  onClose: () => void;
}

export default function AgentDetailPanel({
  plotIndex,
  onClose,
}: AgentDetailPanelProps) {
  const agent = useQuery(
    api.simulation.agents.getByPlot,
    plotIndex !== null ? { plotIndex } : "skip"
  );
  const messages = useQuery(
    api.simulation.agentMessages.getByAgent,
    plotIndex !== null ? { plotIndex, limit: 10 } : "skip"
  );

  if (plotIndex === null || !agent) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/20"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="fixed left-0 top-0 bottom-0 z-50 w-80 bg-zinc-900 text-white overflow-y-auto shadow-2xl animate-slide-in">
        <div className="p-4 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">{agent.name}</h2>
              <span className="text-xs text-zinc-400 uppercase">
                {agent.role} &middot; Plot #{agent.plotIndex}
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-white text-xl leading-none"
            >
              &times;
            </button>
          </div>

          {/* Traits */}
          <div className="flex flex-wrap gap-1.5">
            {agent.traits.map((t) => (
              <span
                key={t}
                className="bg-zinc-700 px-2 py-0.5 rounded text-[10px] font-mono"
              >
                {t}
              </span>
            ))}
          </div>

          {/* Backstory */}
          <p className="text-xs text-zinc-300 italic">{agent.personality}</p>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Wealth" value={`${agent.wealth}g`} />
            <Stat label="Satisfaction" value={`${agent.satisfaction}`} />
            <Stat label="Loyalty" value={`${agent.loyaltyToMayor}`} />
          </div>

          {/* Building */}
          {agent.buildingCategory && (
            <div className="text-xs text-zinc-400">
              Building: <span className="text-zinc-200 font-medium">{agent.buildingCategory}</span>
            </div>
          )}

          {/* Message history */}
          <div>
            <h3 className="text-xs font-semibold text-zinc-400 uppercase mb-2">
              Recent messages
            </h3>
            {messages && messages.length > 0 ? (
              <div className="space-y-1.5">
                {messages.map((msg) => (
                  <div
                    key={(msg as any)._id}
                    className="bg-zinc-800 rounded px-2.5 py-1.5 text-xs"
                  >
                    <span className="text-zinc-500 text-[10px] mr-1">
                      T{msg.tickNumber}
                    </span>
                    <span className={`text-[10px] uppercase mr-1 ${typeColor(msg.messageType)}`}>
                      [{msg.messageType}]
                    </span>
                    {msg.content}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-zinc-500">No messages yet.</div>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes slideIn {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in {
          animation: slideIn 0.2s ease-out;
        }
      `}</style>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-800 rounded px-2 py-1.5">
      <div className="text-[10px] text-zinc-500 uppercase">{label}</div>
      <div className="text-sm font-bold">{value}</div>
    </div>
  );
}

function typeColor(type: string): string {
  switch (type) {
    case "protest": return "text-red-400";
    case "petition": return "text-yellow-400";
    case "praise": return "text-green-400";
    case "announcement": return "text-amber-400";
    case "build_request": return "text-blue-400";
    default: return "text-zinc-400";
  }
}
