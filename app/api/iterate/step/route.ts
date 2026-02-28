import { NextResponse } from "next/server";
import { runIterationStep } from "@/lib/llm/bedrock-converse";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sessionId, renderScreenshots, currentCode } = body as {
      sessionId: string;
      renderScreenshots: {
        front: string;
        right: string;
        back: string;
        left: string;
      };
      currentCode: string;
    };

    if (!sessionId || !renderScreenshots || !currentCode) {
      return NextResponse.json(
        { error: "sessionId, renderScreenshots, and currentCode are required" },
        { status: 400 }
      );
    }

    const result = await runIterationStep(
      sessionId,
      renderScreenshots,
      currentCode
    );

    return NextResponse.json(result);
  } catch (err) {
    console.error("[API/iterate/step] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
