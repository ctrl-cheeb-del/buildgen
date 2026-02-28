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

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    if (!Array.isArray(messages)) {
      return NextResponse.json(
        { error: "messages must be an array" },
        { status: 400 }
      );
    }

    const mistral = getMistral();

    const fullMessages = [
      { role: "system" as const, content: systemPrompt },
      ...messages,
    ];

    console.log(
      "[Chat API] Sending",
      messages.length,
      "user messages, last:",
      JSON.stringify(messages[messages.length - 1]).slice(0, 200)
    );

    const response = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages: fullMessages,
      tools: toolDefinitions,
      toolChoice: "auto",
    });

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
