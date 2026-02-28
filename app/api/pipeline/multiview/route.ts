import { NextResponse } from "next/server";
import { generateMultiView } from "@/lib/nanobanana/multi-view";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.buildingName || typeof body.buildingName !== "string") {
      return NextResponse.json(
        { error: "buildingName is required" },
        { status: 400 }
      );
    }

    const views = await generateMultiView(body.buildingName);
    return NextResponse.json({ views });
  } catch (err) {
    console.error("[API/multiview] Error:", err);
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
