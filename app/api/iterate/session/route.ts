import { NextResponse } from "next/server";
import { createIterationSession } from "@/lib/llm/bedrock-converse";

/**
 * Split a 2x2 grid image into 4 quadrant base64 strings.
 * Uses canvas-free approach: fetch image, use sharp-like splitting via raw pixels.
 * For server-side Node.js, we use the same jimp approach as convex/pipeline.ts.
 */
async function splitGridFromUrl(
  gridUrl: string
): Promise<{ front: string; right: string; back: string; left: string }> {
  const res = await fetch(gridUrl);
  if (!res.ok) throw new Error(`Failed to fetch grid image: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  // Dynamic import of jimp (only available server-side)
  const { Jimp } = await import("jimp");
  const image = await Jimp.read(buffer);
  const width = image.width;
  const height = image.height;
  const halfW = Math.floor(width / 2);
  const halfH = Math.floor(height / 2);

  const positions = [
    { x: 0, y: 0, key: "front" as const },
    { x: halfW, y: 0, key: "right" as const },
    { x: 0, y: halfH, key: "back" as const },
    { x: halfW, y: halfH, key: "left" as const },
  ];

  const results = {} as { front: string; right: string; back: string; left: string };
  for (const { x, y, key } of positions) {
    const cropped = image.clone().crop({ x, y, w: halfW, h: halfH });
    const buf = await cropped.getBuffer("image/png");
    results[key] = `data:image/png;base64,${Buffer.from(buf).toString("base64")}`;
  }

  return results;
}

/**
 * Create a session for the iteration loop.
 * Accepts either:
 * - views: { front, right, back, left } (base64 strings) — legacy
 * - gridUrl: string (URL to 2x2 grid image in Convex storage) — new
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { buildingName, views, gridUrl } = body as {
      buildingName: string;
      views?: { front: string; right: string; back: string; left: string } | null;
      gridUrl?: string | null;
    };

    if (!buildingName) {
      return NextResponse.json(
        { error: "buildingName is required" },
        { status: 400 }
      );
    }

    let resolvedViews: { front: string; right: string; back: string; left: string };

    if (views && views.front) {
      // Legacy path: views provided directly
      resolvedViews = views;
    } else if (gridUrl) {
      // New path: fetch grid URL and split into 4 views
      console.log("[API/iterate/session] Splitting grid from URL...");
      resolvedViews = await splitGridFromUrl(gridUrl);
      console.log("[API/iterate/session] Grid split complete");
    } else {
      return NextResponse.json(
        { error: "Either views or gridUrl is required" },
        { status: 400 }
      );
    }

    const sessionId = createIterationSession(resolvedViews, buildingName);
    return NextResponse.json({ sessionId });
  } catch (err) {
    console.error("[API/iterate/session] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
