import { NextResponse } from "next/server";
import { generateTextureImage } from "@/lib/nanobanana/texture-gen";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.textureId || typeof body.textureId !== "string") {
      return NextResponse.json(
        { error: "textureId is required" },
        { status: 400 }
      );
    }

    const result = await generateTextureImage(body.textureId);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[API/texture] Error:", err);
    const message = err instanceof Error ? err.message : "Internal error";
    const status = message.includes("Unknown texture ID") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
