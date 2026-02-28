"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

// ── Visual config ────────────────────────────────────────────────────

const TYPE_CONFIG: Record<
  string,
  { icon: string; accent: string; bg: string; label: string }
> = {
  announcement: {
    icon: "👑",
    accent: "text-amber-300",
    bg: "from-amber-500/20 to-amber-900/10 border-amber-400/30",
    label: "Mayor",
  },
  build_request: {
    icon: "🏗️",
    accent: "text-blue-300",
    bg: "from-blue-500/15 to-blue-900/10 border-blue-400/25",
    label: "Build",
  },
  protest: {
    icon: "✊",
    accent: "text-red-300",
    bg: "from-red-500/15 to-red-900/10 border-red-400/25",
    label: "Protest",
  },
  petition: {
    icon: "📜",
    accent: "text-yellow-300",
    bg: "from-yellow-500/15 to-yellow-900/10 border-yellow-400/20",
    label: "Petition",
  },
  praise: {
    icon: "🎉",
    accent: "text-emerald-300",
    bg: "from-emerald-500/15 to-emerald-900/10 border-emerald-400/20",
    label: "Praise",
  },
  chat: {
    icon: "💬",
    accent: "text-zinc-300",
    bg: "from-white/10 to-white/5 border-white/15",
    label: "Chat",
  },
};

interface FeedMsg {
  _id: string;
  senderName: string;
  senderPlotIndex: number;
  content: string;
  messageType: string;
  tickNumber: number;
  createdAt: number;
}

// ── Feed Item ────────────────────────────────────────────────────────

function FeedItem({
  msg,
  isNew,
  onAgentClick,
}: {
  msg: FeedMsg;
  isNew: boolean;
  onAgentClick?: (plotIndex: number) => void;
}) {
  const cfg = TYPE_CONFIG[msg.messageType] ?? TYPE_CONFIG.chat;
  const isMayor = msg.messageType === "announcement";

  return (
    <div
      className={`
        relative overflow-hidden rounded-2xl border
        bg-gradient-to-r ${cfg.bg}
        backdrop-blur-2xl
        ${isMayor ? "p-3.5" : "px-3 py-2.5"}
        ${isNew ? "animate-feed-in" : ""}
        cursor-pointer hover:brightness-110 transition-all duration-200
      `}
      onClick={() => onAgentClick?.(msg.senderPlotIndex)}
    >
      {/* Glassmorphism inner glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.08] to-transparent pointer-events-none rounded-2xl" />

      <div className="relative flex gap-2.5 items-start">
        <span className={`text-base ${isMayor ? "text-lg" : ""} shrink-0 mt-0.5`}>
          {cfg.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`text-[11px] font-bold ${cfg.accent}`}>
              {msg.senderName}
            </span>
            <span className="text-[9px] text-white/30 font-mono">
              T{msg.tickNumber}
            </span>
          </div>
          <p
            className={`text-[13px] leading-snug ${
              isMayor
                ? "text-amber-100 font-medium"
                : "text-white/80"
            }`}
          >
            {msg.content}
          </p>
        </div>
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
    <div className="rounded-2xl border border-amber-400/30 bg-gradient-to-r from-amber-500/20 via-amber-600/10 to-amber-900/10 backdrop-blur-2xl p-3.5 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] to-transparent pointer-events-none rounded-2xl" />
      <div className="relative">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm">📯</span>
          <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">
            Royal Decree
          </span>
          <span className="text-[9px] text-amber-400/60 font-mono ml-auto">
            {decree.remainingTicks}t left
          </span>
        </div>
        <p className="text-sm font-semibold text-amber-100">
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
    currentTick > 0 ? { afterTick: Math.max(0, currentTick - 20) } : "skip"
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const prevMsgCountRef = useRef(0);

  // Auto-scroll on new messages
  useEffect(() => {
    if (!messages) return;
    if (messages.length > prevMsgCountRef.current) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth",
        });
      }, 50);
    }
    prevMsgCountRef.current = messages.length;
  }, [messages]);

  // Track seen messages for "new" animation
  useEffect(() => {
    if (!messages) return;
    const timer = setTimeout(() => {
      setSeenIds(new Set(messages.map((m) => (m as any)._id)));
    }, 1500);
    return () => clearTimeout(timer);
  }, [messages]);

  if (!city) return null;

  // Sort: newest last
  const sorted = [...(messages ?? [])].sort(
    (a, b) => a.createdAt - b.createdAt
  );

  // In collapsed mode show last 6
  const visible = expanded ? sorted : sorted.slice(-6);
  const unreadCount = sorted.length - seenIds.size;

  return (
    <div
      className={`
        fixed right-4 z-30 flex flex-col
        transition-all duration-300 ease-out
        ${expanded ? "top-16 bottom-4 w-80" : "top-16 bottom-4 w-72"}
      `}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between px-3.5 py-2 rounded-t-2xl
          bg-black/40 backdrop-blur-2xl border border-white/10 border-b-0
          hover:bg-white/[0.08] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs">👑</span>
          <span className="text-[11px] font-bold text-white/80 tracking-wide">
            KINGDOM FEED
          </span>
          {!expanded && unreadCount > 0 && (
            <span className="bg-amber-500 text-black text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
              {unreadCount}
            </span>
          )}
        </div>
        <span className="text-white/40 text-xs">
          {expanded ? "▾" : "▴"}
        </span>
      </button>

      {/* Scrollable feed */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden
          bg-black/30 backdrop-blur-2xl border-x border-white/10
          scrollbar-hide"
      >
        <div className="p-2.5 space-y-2">
          {/* Active decree */}
          {city.activeDecree && <DecreeBanner decree={city.activeDecree} />}

          {/* Messages */}
          {visible.map((msg) => (
            <FeedItem
              key={(msg as any)._id}
              msg={msg as FeedMsg}
              isNew={!seenIds.has((msg as any)._id)}
              onAgentClick={onAgentClick}
            />
          ))}

          {visible.length === 0 && (
            <div className="text-center py-8 text-white/30 text-xs">
              Waiting for citizens to speak...
            </div>
          )}
        </div>
      </div>

      {/* Footer with sim status */}
      <div className="flex items-center justify-between px-3.5 py-2 rounded-b-2xl
        bg-black/40 backdrop-blur-2xl border border-white/10 border-t-0">
        <div className="flex items-center gap-1.5">
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              city.isRunning ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"
            }`}
          />
          <span className="text-[10px] text-white/40 font-mono">
            {city.isRunning ? `Tick ${city.totalTicks}` : "Paused"}
          </span>
        </div>
        <span className="text-[10px] text-white/30 font-mono">
          {sorted.length} msgs
        </span>
      </div>
    </div>
  );
}
