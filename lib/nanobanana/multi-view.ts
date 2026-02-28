import Replicate from "replicate";
import sharp from "sharp";
import type { MultiViewImages } from "./types";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

/**
 * Generate a 2x2 grid of building elevation views using Replicate,
 * then split into 4 individual images using sharp.
 */
export async function generateMultiView(
  buildingName: string
): Promise<MultiViewImages> {
  const prompt = `Create a 2x2 contiguous grid of 4 distinct architectural elevation views of a building described as: "${buildingName}".

- Top-left: Front elevation view
- Top-right: Right side elevation view
- Bottom-left: Rear elevation view
- Bottom-right: Left side elevation view

Each view should:
- Show the full building from ground to top
- Use clean architectural rendering style with sharp details
- Have a plain white background
- Maintain consistent scale and lighting across all 4 views
- Interpret the description as an actual real architectural structure — the building's shape, facade, and silhouette should clearly evoke the described concept
- No people, no cars, no surrounding buildings`;

  console.log("[MultiView] Calling Replicate for 2x2 grid...");

  const output = await replicate.run("google/nano-banana-2", {
    input: {
      prompt,
      aspect_ratio: "1:1",
      resolution: "2K",
      output_format: "png",
    },
  });

  console.log("[MultiView] Raw output type:", typeof output, Array.isArray(output) ? `array[${(output as unknown[]).length}]` : "");
  if (typeof output === "object" && output !== null) {
    console.log("[MultiView] Output keys:", Object.keys(output as object));
  }

  let imageBuffer: Buffer;

  // Handle the various formats Replicate can return
  if (typeof output === "string") {
    // Direct URL string
    const res = await fetch(output);
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
    imageBuffer = Buffer.from(await res.arrayBuffer());
  } else if (Array.isArray(output) && output.length > 0) {
    const first = output[0];
    if (typeof first === "string") {
      const res = await fetch(first);
      if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
      imageBuffer = Buffer.from(await res.arrayBuffer());
    } else if (first && typeof first === "object" && "url" in first) {
      // { url: string } object
      const res = await fetch((first as { url: string }).url);
      if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
      imageBuffer = Buffer.from(await res.arrayBuffer());
    } else if (first instanceof ReadableStream || (first && typeof (first as ReadableStream).getReader === "function")) {
      const reader = (first as ReadableStream).getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      imageBuffer = Buffer.concat(chunks);
    } else {
      console.error("[MultiView] Unexpected array element type:", typeof first, first);
      throw new Error(`Unexpected Replicate output format: array element is ${typeof first}`);
    }
  } else if (output instanceof ReadableStream || (output && typeof (output as ReadableStream).getReader === "function")) {
    const reader = (output as ReadableStream).getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    imageBuffer = Buffer.concat(chunks);
  } else if (output && typeof output === "object" && "url" in output) {
    const res = await fetch((output as { url: string }).url);
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
    imageBuffer = Buffer.from(await res.arrayBuffer());
  } else {
    console.error("[MultiView] Unexpected output:", JSON.stringify(output)?.slice(0, 500));
    throw new Error(`Unexpected Replicate output format: ${typeof output}`);
  }

  console.log("[MultiView] Got grid image, splitting into 4 views...");
  return splitGridImage(imageBuffer);
}

/**
 * Split a 2x2 grid image buffer into 4 separate base64 data URLs using sharp.
 */
async function splitGridImage(imageBuffer: Buffer): Promise<MultiViewImages> {
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width!;
  const height = metadata.height!;
  const halfW = Math.floor(width / 2);
  const halfH = Math.floor(height / 2);

  const positions: Array<{ left: number; top: number; key: string }> = [
    { left: 0, top: 0, key: "front" },
    { left: halfW, top: 0, key: "right" },
    { left: 0, top: halfH, key: "back" },
    { left: halfW, top: halfH, key: "left" },
  ];

  const results: Record<string, string> = {};

  for (const { left, top, key } of positions) {
    const cropped = await sharp(imageBuffer)
      .extract({ left, top, width: halfW, height: halfH })
      .png()
      .toBuffer();
    results[key] = `data:image/png;base64,${cropped.toString("base64")}`;
  }

  // Also encode the full grid
  const gridPng = await sharp(imageBuffer).png().toBuffer();
  const gridUrl = `data:image/png;base64,${gridPng.toString("base64")}`;

  return {
    front: results.front,
    right: results.right,
    back: results.back,
    left: results.left,
    gridUrl,
  };
}
