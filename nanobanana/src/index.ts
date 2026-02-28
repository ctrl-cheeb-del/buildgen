import { Hono } from "hono";
import { cors } from "hono/cors";
import { generateMultiView } from "./multi-view";
import type { GenerateRequest } from "./types";

const app = new Hono();

app.use("/*", cors());

app.get("/health", (c) => {
  return c.json({ status: "ok", service: "nanobanana" });
});

app.post("/generate", async (c) => {
  const body = await c.req.json<GenerateRequest>();

  if (!body.buildingName || typeof body.buildingName !== "string") {
    return c.json({ error: "buildingName is required" }, 400);
  }

  console.log(`[NanoBanana] Generating views for: "${body.buildingName}"`);

  try {
    const views = await generateMultiView(body.buildingName);
    return c.json({ views });
  } catch (err) {
    console.error("[NanoBanana] Generation failed:", err);
    return c.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      500
    );
  }
});

export default {
  port: 3001,
  fetch: app.fetch,
};
