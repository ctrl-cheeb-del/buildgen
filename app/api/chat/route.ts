import { NextRequest, NextResponse } from "next/server";
import { Mistral } from "@mistralai/mistralai";
import { toolDefinitions, systemPrompt } from "@/lib/chat/tool-definitions";

let _mistral: Mistral | null = null;
function getMistral(): Mistral {
  if (!_mistral) {
    _mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
  }
  return _mistral;
}

async function withRetry<T>(fn: () => Promise<T>, label: string, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimit =
        err instanceof Error &&
        (err.message.includes("429") ||
          err.message.includes("rate_limit") ||
          err.message.includes("Rate limit") ||
          err.message.includes("Too many requests"));
      if (!isRateLimit || attempt === maxRetries) throw err;
      const delayMs = 2000 * Math.pow(2, attempt);
      console.warn(`[retry] ${label} rate-limited (attempt ${attempt + 1}/${maxRetries}), retrying in ${delayMs}ms...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error(`[retry] ${label} exhausted all retries`);
}

export async function POST(req: NextRequest) {
  try {
    const { messages, currentMode } = await req.json();

    if (!Array.isArray(messages)) {
      return NextResponse.json(
        { error: "messages must be an array" },
        { status: 400 }
      );
    }

    const mistral = getMistral();

    const modeContext =
      currentMode === "driving"
        ? "\n\n[state] player is currently in driving mode. don't call drive again unless they ask to restart."
        : currentMode === "walking"
          ? "\n\n[state] player is currently in first-person walking mode. don't call walk again unless they ask to restart."
          : "\n\n[state] player is in default map view (not driving or walking).";

    const fullMessages = [
      { role: "system" as const, content: systemPrompt + modeContext },
      ...messages,
    ];

    console.log(
      "[Chat API] Sending",
      messages.length,
      "user messages, last:",
      JSON.stringify(messages[messages.length - 1]).slice(0, 200)
    );

    const response = await withRetry(
      () => mistral.chat.complete({
        model: "mistral-small-latest",
        messages: fullMessages,
        tools: toolDefinitions,
        toolChoice: "auto",
      }),
      "chat",
    );

    const choice = response?.choices?.[0];

    console.log(
      "[Chat API] Response:",
      JSON.stringify({
        finishReason: choice?.finishReason,
        content: choice?.message?.content?.slice(0, 200),
        toolCalls: choice?.message?.toolCalls,
      })
    );

    if (!choice) {
      return NextResponse.json(
        { error: "No response from model" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: choice.message,
      finishReason: choice.finishReason,
    });
  } catch (err) {
    console.error("[Chat API] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
