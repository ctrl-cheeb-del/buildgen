#!/usr/bin/env bun
/**
 * One-time script: generates tileable textures via Replicate (nano-banana-2)
 * and saves them as WebP files + a manifest JSON into frontend/public/textures/.
 * These are committed to the repo so the whole team has them.
 *
 * Usage:
 *   bun run src/generate-textures.ts                  # generate all
 *   bun run src/generate-textures.ts pavement-slabs grass  # generate specific ones
 *   bun run src/generate-textures.ts --list            # list available texture IDs
 */

import Replicate from "replicate";
import sharp from "sharp";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { TEXTURE_DEFS, type TextureDefinition } from "./texture-prompts";

const OUT_DIR = join(import.meta.dir, "../../frontend/public/textures");

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// ── Replicate output → Buffer (same logic as multi-view.ts) ───────────

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

// ── Generate a single texture (with retries) ─────────────────

const MAX_RETRIES = 3;

async function generateTexture(
  def: TextureDefinition
): Promise<{ outPath: string; base64: string }> {
  console.log(`\n[Texture] Generating "${def.name}" (${def.id})...`);

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 1) console.log(`[Texture] Retry ${attempt}/${MAX_RETRIES}...`);

      const output = await replicate.run("google/nano-banana-2", {
        input: {
          prompt: def.prompt,
          aspect_ratio: "1:1",
          output_format: "png",
        },
      });

      const raw = await replicateOutputToBuffer(output);

      // Resize to 1024x1024, save as WebP (much smaller for the repo)
      const processed = await sharp(raw)
        .resize(1024, 1024, { fit: "cover" })
        .webp({ quality: 85 })
        .toBuffer();

      const outPath = join(OUT_DIR, `${def.id}.webp`);
      await writeFile(outPath, processed);

      const base64 = `data:image/webp;base64,${processed.toString("base64")}`;

      console.log(`[Texture] Saved → ${outPath} (${(processed.length / 1024).toFixed(0)} KB)`);
      return { outPath, base64 };
    } catch (err) {
      lastErr = err;
      console.warn(`[Texture] Attempt ${attempt} failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  throw lastErr;
}

// ── Manifest: JSON with metadata + base64 for each texture ────

interface TextureManifestEntry {
  id: string;
  name: string;
  file: string;
  repeat: number;
  roughness: number;
  metalness: number;
  normalFile?: string;
  normalScale?: number;
}

// ── Sobel normal map generator ──────────────────────────────

async function generateNormalMap(
  diffusePath: string,
  outputPath: string,
  strength: number = 1.0
): Promise<void> {
  // Load diffuse texture as raw grayscale pixels
  const { data, info } = await sharp(diffusePath)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;

  // Sample with wrapping (critical for tileable textures)
  const sample = (x: number, y: number): number =>
    data[((y % h + h) % h) * w + ((x % w + w) % w)];

  // Compute Sobel gradients → normal map RGB
  const out = Buffer.alloc(w * h * 3);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Sobel X kernel
      const dX =
        -sample(x - 1, y - 1) -
        2 * sample(x - 1, y) -
        sample(x - 1, y + 1) +
        sample(x + 1, y - 1) +
        2 * sample(x + 1, y) +
        sample(x + 1, y + 1);

      // Sobel Y kernel (Three.js uses OpenGL Y-up: ny = -dY)
      const dY =
        -sample(x - 1, y - 1) -
        2 * sample(x, y - 1) -
        sample(x + 1, y - 1) +
        sample(x - 1, y + 1) +
        2 * sample(x, y + 1) +
        sample(x + 1, y + 1);

      const nx = dX * strength;
      const ny = -dY * strength; // OpenGL Y-up convention
      const nz = 255;

      // Normalize
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);

      const i = (y * w + x) * 3;
      out[i] = Math.round(((nx / len) * 0.5 + 0.5) * 255);     // R
      out[i + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255); // G
      out[i + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255); // B
    }
  }

  await sharp(out, { raw: { width: w, height: h, channels: 3 } })
    .webp({ quality: 90, nearLossless: true })
    .toFile(outputPath);
}

// ── Generate normals only (no Replicate calls) ──────────────

async function generateNormalsOnly(): Promise<void> {
  console.log("[Normals] Generating normal maps from existing diffuse textures...\n");

  const manifestPath = join(OUT_DIR, "manifest.json");
  let manifest: TextureManifestEntry[] = [];
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf-8"));
  } catch {
    console.error("[Normals] No manifest.json found — run gen:textures first.");
    process.exit(1);
  }

  let generated = 0;
  for (const entry of manifest) {
    const def = TEXTURE_DEFS.find((d) => d.id === entry.id);
    if (!def?.normalScale) continue;

    const diffusePath = join(OUT_DIR, `${entry.id}.webp`);
    const normalPath = join(OUT_DIR, `${entry.id}-normal.webp`);

    try {
      await generateNormalMap(diffusePath, normalPath, def.normalScale);
      entry.normalFile = `/textures/${entry.id}-normal.webp`;
      entry.normalScale = def.normalScale;
      generated++;
      const stat = await Bun.file(normalPath).arrayBuffer();
      console.log(
        `[Normals] ${entry.id}-normal.webp (${(stat.byteLength / 1024).toFixed(0)} KB)`
      );
    } catch (err) {
      console.error(`[Normals] FAILED "${entry.id}":`, err);
    }
  }

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\n[Normals] Done! ${generated} normal maps generated.`);
  console.log(`[Normals] Manifest updated → ${manifestPath}`);
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  // --normals-only flag: generate normal maps from existing diffuse textures
  if (args.includes("--normals-only")) {
    await generateNormalsOnly();
    return;
  }

  // --list flag
  if (args.includes("--list")) {
    console.log("Available texture IDs:\n");
    for (const def of TEXTURE_DEFS) {
      console.log(`  ${def.id.padEnd(20)} ${def.name}`);
    }
    process.exit(0);
  }

  // Filter to specific IDs if provided
  let targets = TEXTURE_DEFS;
  if (args.length > 0) {
    targets = TEXTURE_DEFS.filter((d) => args.includes(d.id));
    const missing = args.filter((a) => !TEXTURE_DEFS.find((d) => d.id === a));
    if (missing.length) {
      console.error(`Unknown texture IDs: ${missing.join(", ")}`);
      console.error(`Run with --list to see available IDs.`);
      process.exit(1);
    }
  }

  await mkdir(OUT_DIR, { recursive: true });

  console.log(`[Texture] Generating ${targets.length} textures → ${OUT_DIR}`);

  const manifest: TextureManifestEntry[] = [];

  for (const def of targets) {
    try {
      await generateTexture(def);
      manifest.push({
        id: def.id,
        name: def.name,
        file: `/textures/${def.id}.webp`,
        repeat: def.repeat,
        roughness: def.roughness,
        metalness: def.metalness,
      });
    } catch (err) {
      console.error(`[Texture] FAILED "${def.id}":`, err);
    }
  }

  // Merge with existing manifest (don't overwrite entries from prior runs)
  const manifestPath = join(OUT_DIR, "manifest.json");
  let existing: TextureManifestEntry[] = [];
  try {
    existing = JSON.parse(await readFile(manifestPath, "utf-8"));
  } catch {}
  const merged = [
    ...existing.filter((e) => !manifest.find((m) => m.id === e.id)),
    ...manifest,
  ].sort((a, b) => a.id.localeCompare(b.id));

  await writeFile(manifestPath, JSON.stringify(merged, null, 2));
  console.log(`\n[Texture] Manifest → ${manifestPath} (${merged.length} total entries)`);
  console.log(`[Texture] Done! ${manifest.length}/${targets.length} succeeded this run.`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
