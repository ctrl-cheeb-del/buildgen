import { NextResponse } from "next/server";
import { TEXTURE_DEFS } from "@/lib/nanobanana/texture-prompts";

export async function GET() {
  return NextResponse.json({ textures: TEXTURE_DEFS });
}
