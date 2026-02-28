import { NextResponse } from "next/server";

const NANOBANANA_URL = process.env.NANOBANANA_URL || "http://localhost:3001";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.buildingName || typeof body.buildingName !== "string") {
      return NextResponse.json(
        { error: "buildingName is required" },
        { status: 400 }
      );
    }

    const res = await fetch(`${NANOBANANA_URL}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buildingName: body.buildingName }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Nanobanana error" }));
      return NextResponse.json(
        { error: err.error || `Nanobanana returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[API/multiview] Error:", err);
    const message = err instanceof Error ? err.message : "Internal error";
    const isConnectionError =
      message.includes("fetch failed") ||
      message.includes("ECONNREFUSED") ||
      message.includes("connect");
    return NextResponse.json(
      {
        error: isConnectionError
          ? `Cannot reach nanobanana service at ${NANOBANANA_URL}. Is it running? (bun run dev:nanobanana)`
          : message,
      },
      { status: 502 }
    );
  }
}
