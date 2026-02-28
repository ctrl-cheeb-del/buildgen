"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useCarStore } from "@/lib/stores/car-store";
import { useFPStore } from "@/lib/stores/fp-store";
import { useChatStore } from "@/lib/stores/chat-store";

interface ChatInputProps {
  onSend: (text: string) => void;
  isLoading: boolean;
  isGenerating?: boolean;
}

export default function ChatInput({ onSend, isLoading, isGenerating }: ChatInputProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const carMode = useCarStore((s) => s.carMode);
  const fpMode = useFPStore((s) => s.fpMode);
  const messages = useChatStore((s) => s.messages);

  const statusMessages = messages.filter((m) => m.role === "status");
  const hasStatus = statusMessages.length > 0 || !!isGenerating;

  useEffect(() => {
    if ((carMode || fpMode) && inputRef.current) {
      inputRef.current.blur();
    }
  }, [carMode, fpMode]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        document.activeElement !== inputRef.current &&
        !e.ctrlKey &&
        !e.metaKey
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed);
    setText("");
  }, [text, isLoading, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const pillH = 52;
  const tabH = 34;
  const tabR = 14;
  const flareR = 12;
  const W = 560;
  const tabW = W * 0.55;
  const tabLeft = (W - tabW) / 2;
  const tabRight = tabLeft + tabW;

  // The tab shape: top rounded corners, bottom has inverse flare ears that
  // extend outward and curve down, sitting flush on top of the pill.
  // The "ears" are the concave fillets connecting the tab to the pill surface.
  const tabPath = [
    // Start at bottom-left ear
    `M ${tabLeft - flareR} ${tabH}`,
    // Concave curve up to tab left side
    `A ${flareR} ${flareR} 0 0 0 ${tabLeft} ${tabH - flareR}`,
    // Left side up
    `L ${tabLeft} ${tabR}`,
    // Top-left corner
    `A ${tabR} ${tabR} 0 0 1 ${tabLeft + tabR} ${0}`,
    // Top edge
    `L ${tabRight - tabR} ${0}`,
    // Top-right corner
    `A ${tabR} ${tabR} 0 0 1 ${tabRight} ${tabR}`,
    // Right side down
    `L ${tabRight} ${tabH - flareR}`,
    // Concave curve to bottom-right ear
    `A ${flareR} ${flareR} 0 0 0 ${tabRight + flareR} ${tabH}`,
    // Close bottom (flat line across bottom, behind the pill)
    `L ${tabLeft - flareR} ${tabH}`,
    `Z`,
  ].join(" ");

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[min(560px,calc(100vw-32px))]">
      <div className="relative" style={{ height: pillH }}>
        {/* Status tab — slides up from behind the pill */}
        <div
          className="absolute left-0 right-0 pointer-events-none"
          style={{
            bottom: pillH - 1, // overlap 1px into pill so no gap
            height: tabH,
            opacity: hasStatus ? 1 : 0,
            transform: hasStatus ? "translateY(0)" : `translateY(${tabH * 0.6}px)`,
            transition: "opacity 400ms ease-out, transform 400ms ease-out",
          }}
        >
          {/* Tab glass background */}
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox={`0 0 ${W} ${tabH}`}
            preserveAspectRatio="none"
          >
            <defs>
              <clipPath id="tab-clip">
                <path d={tabPath} />
              </clipPath>
            </defs>
          </svg>
          <div
            className="absolute inset-0 bg-white/15 backdrop-blur-2xl"
            style={{ clipPath: "url(#tab-clip)" }}
          />
          {/* Tab border */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox={`0 0 ${W} ${tabH}`}
            preserveAspectRatio="none"
          >
            <path
              d={tabPath}
              fill="none"
              stroke="rgba(255,255,255,0.25)"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
            {/* Cover the bottom stroke so it doesn't show a line on the pill */}
            <line
              x1={tabLeft - flareR}
              y1={tabH}
              x2={tabRight + flareR}
              y2={tabH}
              stroke="rgba(255,255,255,0.15)"
              strokeWidth="3"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {/* Tab content */}
          <div className="absolute inset-0 flex items-center justify-center px-5">
            {statusMessages.length > 0 ? (
              statusMessages.map((msg) => (
                <div
                  key={msg.id}
                  className="flex items-center gap-2 text-xs text-white/80"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse flex-shrink-0" />
                  <span className="truncate">{msg.content}</span>
                </div>
              ))
            ) : isGenerating ? (
              <div className="flex items-center gap-2 text-xs text-white/80">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse flex-shrink-0" />
                <span className="truncate">Generating building...</span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Pill — always rendered, never changes */}
        <div className="absolute inset-0 bg-white/15 backdrop-blur-2xl rounded-full border border-white/25 shadow-[0_8px_32px_rgba(0,0,0,0.3)]" />

        {/* Input row */}
        <div className="absolute inset-0 flex items-center gap-2 pl-6 pr-2">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tell me what to build..."
            className="flex-1 bg-transparent text-white text-[15px] placeholder:text-white/50 outline-none"
          />
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || isLoading}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <svg
                className="w-5 h-5 text-white animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                  className="opacity-25"
                />
                <path
                  d="M4 12a8 8 0 018-8"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg
                className="w-5 h-5 text-white"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
