import { Mistral } from "@mistralai/mistralai";

let _mistral: Mistral | null = null;
function getMistral(): Mistral {
  if (!_mistral) {
    _mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
  }
  return _mistral;
}

export type Provider = {
  name: string;
  call: (prompt: string, imageUrls: string[]) => Promise<string>;
};

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

export const providers: Provider[] = [
  {
    name: "Mistral (direct)",
    call: async (prompt, imageUrls) => {
      const imageContent = imageUrls.map((url) => ({
        type: "image_url" as const,
        imageUrl: url,
      }));

      const response = await getMistral().chat.complete({
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
        (("statusCode" in err &&
          (err as { statusCode: number }).statusCode === 429) ||
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
