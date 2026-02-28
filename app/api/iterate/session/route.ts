import { NextResponse } from "next/server";
import { createIterationSession } from "@/lib/llm/bedrock-converse";

/**
 * Create a session for the iteration loop.
 * Stores reference images so that runIterationStep can reuse them.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { buildingName, views } = body as {
      buildingName: string;
      views: { front: string; right: string; back: string; left: string };
    };

    if (!buildingName || !views) {
      return NextResponse.json(
        { error: "buildingName and views are required" },
        { status: 400 }
      );
    }

    const sessionId = createIterationSession(views, buildingName);
    return NextResponse.json({ sessionId });
  } catch (err) {
    console.error("[API/iterate/session] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
