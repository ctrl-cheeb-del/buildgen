import { NextResponse } from "next/server";

// Deferred: QA iteration loop using Mistral Large 3 (mistral-large-latest)
// Will compare screenshots against reference views and improve geometry code
// Model: mistral-large-latest (vision + code capabilities)
export async function POST() {
  return NextResponse.json(
    { error: "Iteration endpoint not yet implemented — will use mistral-large-latest" },
    { status: 501 }
  );
}
