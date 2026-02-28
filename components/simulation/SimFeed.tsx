"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

// ── Types ────────────────────────────────────────────────────────────

interface FeedMsg {
  _id: string;
  senderName: string;
  senderPlotIndex: number;
  content: string;
  messageType: string;
  tickNumber: number;
  createdAt: number;
}

interface AgentInfo {
  name: string;
  role: string;
  plotIndex: number;
  wealth: number;
  satisfaction: number;
  loyaltyToMayor: number;
  traits: string[];
  buildingCategory?: string;
}

// ── Agent Tooltip ────────────────────────────────────────────────────

function AgentTooltip({
  agent,
  anchorRect,
}: {
  agent: AgentInfo;
  anchorRect: DOMRect | null;
}) {
  if (!anchorRect) return null;

  // Position tooltip to the left of the bubble, vertically centered
  const style: React.CSSProperties = {
    position: "fixed",
    top: anchorRect.top,
    left: anchorRect.left - 204, // 192px width + 12px gap
    zIndex: 60,
  };

  return (
    <div
      className="w-48 rounded-xl p-2.5 pointer-events-none animate-fade-in backdrop-blur-2xl"
      style={{
        ...style,
        background: "rgba(255, 255, 255, 0.12)",
        border: "1px solid rgba(255, 255, 255, 0.25)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.3), 0 8px 32px rgba(0,0,0,0.25)",
      }}
    >
      <div className="text-[11px] font-semibold text-white mb-0.5">
        {agent.name}
      </div>
      <div className="text-[9px] text-white/40 uppercase tracking-wide mb-2">
        {agent.role} · Plot #{agent.plotIndex}
      </div>
      <div className="grid grid-cols-3 gap-1">
        <div className="text-center">
          <div className="text-[9px] text-white/35">Wealth</div>
          <div className="text-[11px] font-bold text-amber-300">
            ${agent.wealth}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[9px] text-white/35">Happy</div>
          <div className="text-[11px] font-bold text-emerald-300">
            {agent.satisfaction}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[9px] text-white/35">Loyalty</div>
          <div className="text-[11px] font-bold text-blue-300">
            {agent.loyaltyToMayor}
          </div>
        </div>
      </div>
      {agent.traits.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {agent.traits.slice(0, 3).map((t) => (
            <span
              key={t}
              className="text-[8px] text-white/60 rounded px-1 py-px"
              style={{
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.15)",
              }}
            >
              {t}
            </span>
          ))}
        </div>
      )}
      <div className="text-[8px] text-white/25 mt-1.5">Click for details</div>
    </div>
  );
}

// ── Feed Item — iMessage-style bubble ────────────────────────────────

function FeedItem({
  msg,
  isNew,
  onAgentClick,
  agent,
}: {
  msg: FeedMsg;
  isNew: boolean;
  onAgentClick?: (plotIndex: number) => void;
  agent?: AgentInfo;
}) {
  const isMayor = msg.messageType === "announcement";
  const [hovered, setHovered] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const handleMouseEnter = () => {
    setHovered(true);
    if (bubbleRef.current) {
      setAnchorRect(bubbleRef.current.getBoundingClientRect());
    }
  };

  return (
    <div
      className={`${isNew ? "animate-feed-in" : ""} cursor-pointer`}
      onClick={() => onAgentClick?.(msg.senderPlotIndex)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Tooltip rendered via portal-like fixed position */}
      {hovered && agent && (
        <AgentTooltip agent={agent} anchorRect={anchorRect} />
      )}

      {/* Sender name above bubble */}
      <div className="flex items-center gap-1.5 mb-0.5 px-1">
        <span
          className={`text-[11px] font-semibold ${
            isMayor ? "text-amber-300" : "text-white/60"
          }`}
        >
          {msg.senderName}
        </span>
        <span className="text-[9px] text-white/20 font-mono">
          T{msg.tickNumber}
        </span>
      </div>

      {/* Bubble — solid background, no backdrop-blur on individual items */}
      <div
        ref={bubbleRef}
        className="rounded-2xl px-3.5 py-2 transition-colors"
        style={
          isMayor
            ? {
                background: "rgba(217, 168, 50, 0.18)",
                border: "1px solid rgba(217, 168, 50, 0.25)",
              }
            : {
                background: "rgba(255, 255, 255, 0.13)",
                border: "1px solid rgba(255, 255, 255, 0.18)",
              }
        }
      >
        <p
          className={`text-[13px] leading-snug ${
            isMayor ? "text-amber-100 font-medium" : "text-white/90"
          }`}
          style={{ textShadow: "0 1px 3px rgba(0,0,0,0.4)" }}
        >
          {msg.content}
        </p>
      </div>
    </div>
  );
}

// ── Decree Banner ────────────────────────────────────────────────────

function DecreeBanner({
  decree,
}: {
  decree: { title: string; description: string; remainingTicks: number };
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-0.5 px-1">
        <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">
          Royal Decree
        </span>
        <span className="text-[9px] text-amber-400/60 font-mono">
          {decree.remainingTicks}t left
        </span>
      </div>
      <div
        className="rounded-2xl px-3.5 py-2.5"
        style={{
          background: "rgba(217, 168, 50, 0.18)",
          border: "1px solid rgba(217, 168, 50, 0.25)",
        }}
      >
        <p
          className="text-sm font-semibold text-amber-100"
          style={{ textShadow: "0 1px 3px rgba(0,0,0,0.4)" }}
        >
          {decree.title}
        </p>
        <p className="text-[11px] text-amber-200/60 mt-0.5">
          {decree.description}
        </p>
      </div>
    </div>
  );
}

// ── Main Feed Panel ──────────────────────────────────────────────────

export default function SimFeed({
  onAgentClick,
}: {
  onAgentClick?: (plotIndex: number) => void;
}) {
  const city = useQuery(api.simulation.cityState.get);
  const currentTick = city?.totalTicks ?? 0;
  const messages = useQuery(
    api.simulation.agentMessages.getRecent,
    city ? { afterTick: Math.max(0, currentTick - 20) } : "skip"
  );
  const agents = useQuery(api.simulation.agents.getAll);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const prevMsgCountRef = useRef(0);

  // Build agent lookup by plotIndex
  const agentMap = new Map<number, AgentInfo>();
  if (agents) {
    for (const a of agents) {
      agentMap.set(a.plotIndex, a as AgentInfo);
    }
  }

  // Scroll to bottom on new messages
  useEffect(() => {
    if (!messages || !expanded) return;
    if (messages.length > prevMsgCountRef.current) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth",
        });
      }, 50);
    }
    prevMsgCountRef.current = messages.length;
  }, [messages, expanded]);

  // Instant scroll to bottom when opening
  useEffect(() => {
    if (expanded) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
        });
      });
    }
  }, [expanded]);

  // Track seen messages for "new" animation
  useEffect(() => {
    if (!messages) return;
    const timer = setTimeout(() => {
      setSeenIds(new Set(messages.map((m) => (m as any)._id)));
    }, 1500);
    return () => clearTimeout(timer);
  }, [messages]);

  if (!city) return null;

  // Sort: newest last (bottom)
  const sorted = [...(messages ?? [])].sort(
    (a, b) => a.createdAt - b.createdAt
  );

  const visible = expanded ? sorted : sorted.slice(-6);
  const unreadCount = sorted.length - seenIds.size;

  return (
    <div className="fixed bottom-6 right-4 z-30 flex flex-col items-end">
      {/* Expanded messages panel */}
      {expanded && (
        <div
          ref={scrollRef}
          className="w-80 max-h-[50vh] overflow-y-auto overflow-x-hidden scrollbar-hide mb-2 animate-fade-in"
        >
          <div className="flex flex-col gap-2.5 p-1">
            {/* Active decree */}
            {city.activeDecree && <DecreeBanner decree={city.activeDecree} />}

            {/* Messages */}
            {visible.map((msg) => (
              <FeedItem
                key={(msg as any)._id}
                msg={msg as FeedMsg}
                isNew={!seenIds.has((msg as any)._id)}
                onAgentClick={onAgentClick}
                agent={agentMap.get(msg.senderPlotIndex)}
              />
            ))}

            {visible.length === 0 && (
              <div className="text-center py-6 text-white/30 text-xs">
                Waiting for citizens to speak...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Minimized pill — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2.5 px-4 py-2 rounded-full
          bg-white/15 backdrop-blur-2xl border border-white/25
          shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_4px_16px_rgba(0,0,0,0.2)]
          hover:bg-white/20 transition-colors"
      >
        {/* Status dot */}
        <div
          className={`w-2 h-2 rounded-full flex-shrink-0 ${
            city.isRunning ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"
          }`}
        />

        <span className="text-[11px] font-bold text-white/80 tracking-wide">
          Kingdom Feed
        </span>

        {!expanded && unreadCount > 0 && (
          <span className="bg-amber-500 text-black text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
            {unreadCount}
          </span>
        )}

        <svg
          className={`w-3 h-3 text-white/50 transition-transform duration-200 ${
            expanded ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
        </svg>
      </button>
    </div>
  );
}
