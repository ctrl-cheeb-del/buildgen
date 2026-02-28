"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useChatStore, type ChatMessage } from "@/lib/stores/chat-store";

const FADE_DELAY = 8000;
const FADE_DURATION = 2000;

function ChatBubble({
  msg,
  onFaded,
}: {
  msg: ChatMessage;
  onFaded: (id: string) => void;
}) {
  const [opacity, setOpacity] = useState(1);
  const [translateY, setTranslateY] = useState(0);

  useEffect(() => {
    const fadeTimer = setTimeout(() => {
      setOpacity(0);
      setTranslateY(-12);
    }, FADE_DELAY);

    const removeTimer = setTimeout(() => {
      onFaded(msg.id);
    }, FADE_DELAY + FADE_DURATION);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, [msg.id, onFaded]);

  const isUser = msg.role === "user";

  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"} animate-slide-up-fade`}
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        transition: `opacity ${FADE_DURATION}ms ease-out, transform ${FADE_DURATION}ms ease-out`,
      }}
    >
      <div
        className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${
          isUser
            ? "bg-white/25 backdrop-blur-xl border border-white/30 text-white"
            : "bg-white/10 backdrop-blur-xl border border-white/15 text-white/90"
        }`}
        style={{ textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}
      >
        {msg.content}
      </div>
    </div>
  );
}

export default function ChatMessages() {
  const messages = useChatStore((s) => s.messages);
  const isLoading = useChatStore((s) => s.isLoading);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [fadedIds, setFadedIds] = useState<Set<string>>(new Set());

  const handleFaded = useCallback((id: string) => {
    setFadedIds((prev) => new Set(prev).add(id));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Only show non-status, non-faded messages
  const chatMessages = messages
    .filter((m) => m.role !== "status")
    .filter((m) => !fadedIds.has(m.id));

  if (chatMessages.length === 0 && !isLoading) return null;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 w-[min(560px,calc(100vw-32px))] max-h-[35vh] overflow-y-auto scrollbar-hide pointer-events-none">
      <div className="flex flex-col gap-2 p-2">
        {chatMessages.map((msg) => (
          <ChatBubble key={msg.id} msg={msg} onFaded={handleFaded} />
        ))}

        {isLoading && (
          <div className="flex justify-start animate-slide-up-fade">
            <div className="px-3.5 py-2 bg-white/10 backdrop-blur-xl border border-white/15 rounded-2xl">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-white/60 animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-white/60 animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-white/60 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
