import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });
  }
  return _client;
}

/** Reset the cached client so the next call picks up fresh credentials. */
export function resetProviderChainClient(): void {
  _client = null;
}

async function callAnthropic(
  modelId: string,
  prompt: string,
  imageUrls: string[]
): Promise<string> {
  const content: Anthropic.MessageCreateParams["messages"][0]["content"] = [];

  for (const url of imageUrls) {
    if (url.startsWith("data:")) {
      const match = url.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/);
      if (match) {
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: match[1] as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: match[2],
          },
        });
      }
    } else {
      const res = await fetch(url);
      const buf = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get("content-type") || "image/png";
      const formatMatch = contentType.match(/image\/(jpeg|png|gif|webp)/);
      const mediaType = formatMatch
        ? (`image/${formatMatch[1]}` as "image/jpeg" | "image/png" | "image/gif" | "image/webp")
        : ("image/png" as const);
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType,
          data: buf.toString("base64"),
        },
      });
    }
  }

  content.push({ type: "text", text: prompt });

  const response = await getClient().messages.create({
    model: modelId,
    max_tokens: 16384,
    messages: [{ role: "user", content }],
  });

  const textBlocks = response.content.filter(
    (block): block is Anthropic.TextBlock => block.type === "text"
  );
  const text = textBlocks.map((b) => b.text).join("");
  if (!text) throw new Error(`Anthropic ${modelId} returned no content`);
  return text;
}

export async function callOpenRouter(
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

export type Provider = {
  name: string;
  call: (prompt: string, imageUrls: string[]) => Promise<string>;
};

export const providers: Provider[] = [
  {
    name: "Anthropic (Claude Opus 4.6)",
    call: (prompt, imageUrls) =>
      callAnthropic("claude-opus-4-6-20250625", prompt, imageUrls),
  },
  {
    name: "OpenRouter (Claude Opus 4.6)",
    call: (prompt, imageUrls) =>
      callOpenRouter("anthropic/claude-opus-4-6", prompt, imageUrls),
  },
  {
    name: "OpenRouter (Mistral Large)",
    call: (prompt, imageUrls) =>
      callOpenRouter("mistralai/mistral-large-2512", prompt, imageUrls),
  },
];

export async function callWithFallback(
  prompt: string,
  imageUrls: string[]
): Promise<string> {
  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    try {
      console.log(`[LLM] Trying ${provider.name}...`);
      const result = await provider.call(prompt, imageUrls);
      console.log(`[LLM] Success with ${provider.name}`);
      return result;
    } catch (err) {
      const isRateLimit =
        err instanceof Error &&
        (("status" in err &&
          (err as { status: number }).status === 429) ||
          err.message.includes("429") ||
          err.message.includes("rate_limit") ||
          err.message.includes("Rate limit"));

      console.error(
        `[LLM] ${provider.name} failed:`,
        err instanceof Error ? err.message : err
      );

      // Only fall through to next provider on rate limits
      if (!isRateLimit || i === providers.length - 1) throw err;

      console.log(`[LLM] Rate limited, falling back to next provider...`);
    }
  }
  throw new Error("All providers exhausted");
}
