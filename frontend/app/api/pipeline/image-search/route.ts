import { NextResponse } from "next/server";

// Deferred: Image search not needed for MVP
export async function POST() {
  return NextResponse.json(
    { error: "Image search endpoint not yet implemented" },
    { status: 501 }
  );
}
