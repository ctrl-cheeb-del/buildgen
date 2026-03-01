import Replicate from "replicate";
import sharp from "sharp";
import { TEXTURE_DEFS, type TextureDefinition } from "./texture-prompts";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export { TEXTURE_DEFS };
export type { TextureDefinition };

/**
 * Generate a single tileable texture via Replicate, returning a
 * 1024x1024 PNG as a base64 data URL.
 */
export async function generateTextureImage(
  textureId: string
): Promise<{ base64: string; definition: TextureDefinition }> {
  const def = TEXTURE_DEFS.find((d) => d.id === textureId);
  if (!def) throw new Error(`Unknown texture ID: ${textureId}`);

  console.log(`[TextureGen] Generating "${def.name}"...`);

  const output = await replicate.run("google/nano-banana-2", {
    input: {
      prompt: def.prompt,
      aspect_ratio: "1:1",
      resolution: "1K",
      output_format: "png",
    },
  });

  const raw = await replicateOutputToBuffer(output);

  const processed = await sharp(raw)
    .resize(1024, 1024, { fit: "cover" })
    .webp({ quality: 85 })
    .toBuffer();

  const base64 = `data:image/webp;base64,${processed.toString("base64")}`;

  console.log(`[TextureGen] Done "${def.name}" (${(processed.length / 1024).toFixed(0)} KB)`);
  return { base64, definition: def };
}

// ── Replicate output handling ─────────────────────────────────

async function replicateOutputToBuffer(output: unknown): Promise<Buffer> {
  // FileOutput object — has .url and toString() returns the URL
  const url = String(output);
  if (typeof output === "object" && output !== null && "url" in output && url.startsWith("http")) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  if (typeof output === "string") {
    const res = await fetch(output);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  if (Array.isArray(output) && output.length > 0) {
    const first = output[0];
    if (typeof first === "string") {
      const res = await fetch(first);
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    }
    if (first && typeof first === "object" && "url" in first) {
      const res = await fetch((first as { url: string }).url);
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    }
    if (
      first instanceof ReadableStream ||
      (first && typeof (first as ReadableStream).getReader === "function")
    ) {
      return streamToBuffer(first as ReadableStream);
    }
  }

  if (
    output instanceof ReadableStream ||
    (output && typeof (output as ReadableStream).getReader === "function")
  ) {
    return streamToBuffer(output as ReadableStream);
  }

  if (output && typeof output === "object" && "url" in output) {
    const res = await fetch((output as { url: string }).url);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  throw new Error(`Unexpected Replicate output: ${typeof output}`);
}

async function streamToBuffer(stream: ReadableStream): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
