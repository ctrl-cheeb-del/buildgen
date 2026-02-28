import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();

app.use("/*", cors());

app.get("/health", (c) => {
  return c.json({ status: "ok", service: "gaussian-splats" });
});

export default {
  port: 3002,
  fetch: app.fetch,
};
