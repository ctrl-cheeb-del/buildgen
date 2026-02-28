import { NextResponse } from "next/server";
import { Mistral } from "@mistralai/mistralai";

const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

/* ------------------------------------------------------------------ */
/*  Provider chain: Mistral direct → OpenRouter Mistral → OpenRouter Opus  */
/* ------------------------------------------------------------------ */

type Provider = {
  name: string;
  call: (prompt: string, imageUrls: string[]) => Promise<string>;
};

async function callOpenRouter(
  model: string,
  prompt: string,
  imageUrls: string[]
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  const content: Array<Record<string, unknown>> = imageUrls.map((url) => ({
    type: "image_url",
    image_url: { url },
  }));
  content.push({ type: "text", text: prompt });

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter ${model} error ${res.status}: ${body}`);
  }

  const json = await res.json();
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error(`OpenRouter ${model} returned no content`);
  return text;
}

const providers: Provider[] = [
  {
    name: "Mistral (direct)",
    call: async (prompt, imageUrls) => {
      const imageContent = imageUrls.map((url) => ({
        type: "image_url" as const,
        imageUrl: url,
      }));

      const response = await mistral.chat.complete({
        model: "mistral-large-latest",
        messages: [
          {
            role: "user",
            content: [...imageContent, { type: "text" as const, text: prompt }],
          },
        ],
      });

      const text = response?.choices?.[0]?.message?.content;
      if (!text || typeof text !== "string")
        throw new Error("Mistral returned no content");
      return text;
    },
  },
  {
    name: "OpenRouter (Mistral Large)",
    call: (prompt, imageUrls) =>
      callOpenRouter("mistralai/mistral-large-2512", prompt, imageUrls),
  },
  {
    name: "OpenRouter (Claude Opus 4.6)",
    call: (prompt, imageUrls) =>
      callOpenRouter("anthropic/claude-opus-4-6", prompt, imageUrls),
  },
];

async function callWithFallback(
  prompt: string,
  imageUrls: string[]
): Promise<string> {
  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    try {
      console.log(`[API/geometry] Trying ${provider.name}...`);
      const result = await provider.call(prompt, imageUrls);
      console.log(`[API/geometry] Success with ${provider.name}`);
      return result;
    } catch (err) {
      const isRateLimit =
        err instanceof Error &&
        (("statusCode" in err &&
          (err as { statusCode: number }).statusCode === 429) ||
          err.message.includes("429") ||
          err.message.includes("rate_limit") ||
          err.message.includes("Rate limit"));

      console.error(
        `[API/geometry] ${provider.name} failed:`,
        err instanceof Error ? err.message : err
      );

      // Only fall through to next provider on rate limits
      if (!isRateLimit || i === providers.length - 1) throw err;

      console.log(`[API/geometry] Rate limited, falling back to next provider...`);
    }
  }
  throw new Error("All providers exhausted");
}

export async function POST(request: Request) {
  try {
    const { buildingName, views } = await request.json();

    if (!buildingName || !views) {
      return NextResponse.json(
        { error: "buildingName and views are required" },
        { status: 400 }
      );
    }

    const imageUrls: string[] = [];
    for (const view of ["front", "right", "back", "left"] as const) {
      const url = views[view];
      if (url) imageUrls.push(url);
    }

    const prompt = `You are an expert Three.js developer. I'm showing you reference views of a building described as "${buildingName}" (front, right, back, left elevations).

Generate JavaScript code that creates a THREE.Group representing this building using procedural geometry.

IMPORTANT: The description may be creative or fantastical (e.g. "a beaver-shaped building", "a mushroom tower", "a building that looks like a guitar"). Study the reference images carefully and recreate the unique shape, silhouette, and features you see. The 3D model should clearly look like the subject described — capture its distinctive outline, proportions, and character.

REQUIREMENTS:
- Return ONLY a JavaScript function body that will be wrapped in: function(THREE) { ... return group; }
- Create a THREE.Group as the root
- Use THREE.BoxGeometry, THREE.CylinderGeometry, THREE.SphereGeometry, THREE.ExtrudeGeometry, THREE.Shape, THREE.LatheGeometry, etc. — use whatever geometry types best capture the shape
- Use THREE.MeshPhysicalMaterial with appropriate colors matching what you see in the images:
  - Glass: { color: 0x88ccee, transparent: true, opacity: 0.4, metalness: 0.9, roughness: 0.1 }
  - Concrete: { color: 0xcccccc, roughness: 0.8, metalness: 0.1 }
  - Steel: { color: 0xaaaaaa, metalness: 0.8, roughness: 0.3 }
  - Stone: { color: 0xd4c5a9, roughness: 0.9, metalness: 0.0 }
  - Use any other colors that match the reference images
- NO texture loading, NO external files
- Build the model centered at origin, Y-up
- Scale so the building is approximately 100 units tall
- Focus on capturing the overall silhouette and distinctive features — make it immediately recognizable as "${buildingName}"
- Use THREE.Shape + ExtrudeGeometry for organic or curved cross-sections
- The code must be valid JavaScript that can run in a Function constructor

EXAMPLE OUTPUT FORMAT:
\`\`\`javascript
const group = new THREE.Group();

const baseMat = new THREE.MeshPhysicalMaterial({ color: 0xcccccc, roughness: 0.8 });
const baseGeo = new THREE.BoxGeometry(40, 60, 40);
const base = new THREE.Mesh(baseGeo, baseMat);
base.position.y = 30;
group.add(base);

// ... more geometry ...

return group;
\`\`\`

Generate the code now for "${buildingName}". Study the images closely and make the 3D model match what you see.`;

    const text = await callWithFallback(prompt, imageUrls);

    // Extract code from markdown code blocks
    const codeMatch = text.match(/```(?:javascript|js)?\s*\n([\s\S]*?)```/);
    const code = codeMatch ? codeMatch[1].trim() : text.trim();

    if (!code) {
      throw new Error("LLM returned no usable geometry code");
    }

    return NextResponse.json({ code });
  } catch (err) {
    console.error("[API/geometry] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
