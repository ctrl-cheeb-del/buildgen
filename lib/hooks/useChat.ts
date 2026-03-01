"use client";

import { useCallback, useRef } from "react";
import { useChatStore } from "@/lib/stores/chat-store";
import { useCarStore } from "@/lib/stores/car-store";
import { useFPStore } from "@/lib/stores/fp-store";
import { executeTool, type ToolDeps } from "@/lib/chat/tool-executor";

interface MistralMessage {
  role: "user" | "assistant" | "tool";
  content?: string;
  toolCalls?: Array<{
    id: string;
    function: { name: string; arguments: string };
  }>;
  toolCallId?: string;
  name?: string;
}

export function useChat(deps: ToolDeps) {
  const addMessage = useChatStore((s) => s.addMessage);
  const setLoading = useChatStore((s) => s.setLoading);
  const historyRef = useRef<MistralMessage[]>([]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      // Add user message to UI + history
      addMessage({ role: "user", content: text });
      historyRef.current.push({ role: "user", content: text });

      setLoading(true);

      try {
        let rounds = 0;
        const MAX_ROUNDS = 5;

        while (rounds < MAX_ROUNDS) {
          rounds++;

          const MAX_RETRIES = 3;
          const TIMEOUT_MS = 5000;
          let res: Response | undefined;

          for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

            try {
              const carMode = useCarStore.getState().carMode;
              const fpMode = useFPStore.getState().fpMode;
              res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  messages: historyRef.current,
                  currentMode: carMode ? "driving" : fpMode ? "walking" : "default",
                }),
                signal: controller.signal,
              });
              clearTimeout(timeout);
              break; // success
            } catch (fetchErr) {
              clearTimeout(timeout);
              const isAbort =
                fetchErr instanceof Error && fetchErr.name === "AbortError";
              if (attempt < MAX_RETRIES - 1) {
                console.warn(`[useChat] Attempt ${attempt + 1} failed (${isAbort ? "timeout" : "network"}), retrying...`);
                continue;
              }
              addMessage({
                role: "assistant",
                content: isAbort
                  ? "Request timed out after retries. Try again!"
                  : "Network error. Try again!",
              });
              break;
            }
          }

          if (!res) break;

          if (!res.ok) {
            const err = await res
              .json()
              .catch(() => ({ error: "Request failed" }));
            addMessage({
              role: "assistant",
              content: err.error || "Something went wrong.",
            });
            break;
          }

          const { message, finishReason } = await res.json();

          // Add assistant message to history
          historyRef.current.push(message);

          // If there are tool calls, execute them
          if (message.toolCalls && message.toolCalls.length > 0) {
            // Show any text content alongside tool calls
            if (message.content) {
              addMessage({ role: "assistant", content: message.content });
            }

            for (const tc of message.toolCalls) {
              const args = JSON.parse(tc.function.arguments || "{}");
              const result = executeTool(tc.function.name, args, deps);

              // Add tool result to history for next round
              historyRef.current.push({
                role: "tool",
                content: result,
                toolCallId: tc.id,
                name: tc.function.name,
              });
            }

            // Continue loop — send tool results back to get final text
            if (finishReason === "tool_calls") {
              continue;
            }
          }

          // Final text response (only if not already shown above with tool calls)
          const hasToolCalls =
            message.toolCalls && message.toolCalls.length > 0;
          const hasContent = message.content && message.content.trim();

          if (hasContent && !hasToolCalls) {
            addMessage({ role: "assistant", content: message.content });
          } else if (!hasContent && !hasToolCalls) {
            // Model returned empty — nothing to show
            console.warn("[useChat] Model returned empty response");
          }
          break;
        }
      } catch (err) {
        console.error("[useChat] Error:", err);
        addMessage({
          role: "assistant",
          content: "Sorry, something went wrong. Try again!",
        });
      } finally {
        setLoading(false);
      }
    },
    [addMessage, setLoading, deps]
  );

  const clearHistory = useCallback(() => {
    historyRef.current = [];
    useChatStore.getState().clearMessages();
  }, []);

  return { sendMessage, clearHistory };
}
