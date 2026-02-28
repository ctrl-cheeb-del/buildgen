import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const convex = new ConvexHttpClient(
  process.env.NEXT_PUBLIC_CONVEX_URL as string
);

export async function POST() {
  try {
    const result = await convex.action(api.simulation.control.startSimulation);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[api/simulation/start]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
