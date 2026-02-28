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
        className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Panel — liquid glass, darker variant */}
      <div
        className="fixed left-4 top-4 bottom-4 z-50 w-80 rounded-2xl overflow-hidden animate-slide-in"
        style={{
          background: "rgba(0, 0, 0, 0.55)",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.2), 0 8px 40px rgba(0,0,0,0.5)",
        }}
      >
        {/* Top highlight gradient */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white/[0.06] to-transparent pointer-events-none" />

        <div className="relative h-full overflow-y-auto scrollbar-hide backdrop-blur-2xl">
          <div className="p-5 space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-white" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>
                  {agent.name}
                </h2>
                <span className="text-[10px] text-white/40 uppercase tracking-wider font-medium">
                  {agent.role} · Plot #{agent.plotIndex}
                </span>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-full text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors text-lg leading-none"
              >
                ×
              </button>
            </div>

            {/* Traits */}
            <div className="flex flex-wrap gap-1.5">
              {agent.traits.map((t) => (
                <span
                  key={t}
                  className="text-[10px] text-white/70 font-medium px-2 py-0.5 rounded-full"
                  style={{
                    background: "rgba(255, 255, 255, 0.1)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                  }}
                >
                  {t}
                </span>
              ))}
            </div>

            {/* Backstory */}
            <p
              className="text-[12px] text-white/55 italic leading-relaxed"
              style={{ textShadow: "0 1px 3px rgba(0,0,0,0.4)" }}
            >
              {agent.personality}
            </p>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Wealth" value={`$${agent.wealth}`} color="amber" />
              <Stat label="Satisfaction" value={`${agent.satisfaction}`} color="emerald" />
              <Stat label="Loyalty" value={`${agent.loyaltyToMayor}`} color="blue" />
            </div>

            {/* Building */}
            {agent.buildingCategory && (
              <div
                className="rounded-xl px-3.5 py-2.5"
                style={{
                  background: "rgba(255, 255, 255, 0.06)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                }}
              >
                <span className="text-[10px] text-white/35 uppercase tracking-wide">Building</span>
                <div className="text-[12px] text-white/80 font-medium mt-0.5">
                  {agent.buildingCategory}
                </div>
              </div>
            )}

            {/* Message history */}
            <div>
              <h3 className="text-[10px] font-bold text-white/35 uppercase tracking-wider mb-3">
                Recent Messages
              </h3>
              {messages && messages.length > 0 ? (
                <div className="space-y-2">
                  {messages.map((msg) => (
                    <div
                      key={(msg as any)._id}
                      className="rounded-xl px-3.5 py-2.5"
                      style={{
                        background:
                          msg.messageType === "announcement"
                            ? "rgba(217, 168, 50, 0.12)"
                            : "rgba(255, 255, 255, 0.06)",
                        border:
                          msg.messageType === "announcement"
                            ? "1px solid rgba(217, 168, 50, 0.2)"
                            : "1px solid rgba(255, 255, 255, 0.08)",
                      }}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[9px] text-white/30 font-mono">
                          T{msg.tickNumber}
                        </span>
                        <span className={`text-[9px] uppercase font-bold ${typeColor(msg.messageType)}`}>
                          {msg.messageType}
                        </span>
                      </div>
                      <p className="text-[12px] text-white/80 leading-snug">
                        {msg.content}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-white/25 text-center py-4">
                  No messages yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes slideIn {
          from { transform: translateX(-100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-slide-in {
          animation: slideIn 0.25s ease-out;
        }
      `}</style>
    </>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: "amber" | "emerald" | "blue" }) {
  const colorMap = {
    amber: "text-amber-300",
    emerald: "text-emerald-300",
    blue: "text-blue-300",
  };
  return (
    <div
      className="rounded-xl px-3 py-2.5 text-center"
      style={{
        background: "rgba(255, 255, 255, 0.06)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
      }}
    >
      <div className="text-[9px] text-white/35 uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-bold mt-0.5 ${colorMap[color]}`}>{value}</div>
    </div>
  );
}

function typeColor(type: string): string {
  switch (type) {
    case "protest": return "text-red-400/70";
    case "petition": return "text-yellow-400/70";
    case "praise": return "text-emerald-400/70";
    case "announcement": return "text-amber-400/70";
    case "build_request": return "text-blue-400/70";
    default: return "text-white/30";
  }
}
