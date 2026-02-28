import { Mistral } from "@mistralai/mistralai";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

let _mistral: Mistral | null = null;
function getMistral(): Mistral {
  if (!_mistral) {
    _mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
  }
  return _mistral;
}

let _bedrock: BedrockRuntimeClient | null = null;
function getBedrock(): BedrockRuntimeClient {
  if (!_bedrock) {
    _bedrock = new BedrockRuntimeClient({
      region: process.env.AWS_DEFAULT_REGION || "us-west-2",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        sessionToken: process.env.AWS_SESSION_TOKEN,
      },
    });
  }
  return _bedrock;
}

async function callBedrock(
  modelId: string,
  prompt: string,
  imageUrls: string[]
): Promise<string> {
  const content: Array<Record<string, unknown>> = [];

  for (const url of imageUrls) {
    const res = await fetch(url);
    const buf = Buffer.from(await res.arrayBuffer());
    const mediaType = res.headers.get("content-type") || "image/png";
    content.push({
      type: "image",
      source: { type: "base64", media_type: mediaType, data: buf.toString("base64") },
    });
  }

  content.push({ type: "text", text: prompt });

  const body = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 8192,
    messages: [{ role: "user", content }],
  });

  const command = new InvokeModelCommand({
    modelId,
    contentType: "application/json",
    body: new TextEncoder().encode(body),
  });

  const response = await getBedrock().send(command);
  const result = JSON.parse(new TextDecoder().decode(response.body));
  const text = result.content?.[0]?.text;
  if (!text) throw new Error(`Bedrock ${modelId} returned no content`);
  return text;
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
    name: "Bedrock (Claude Opus 4.6)",
    call: (prompt, imageUrls) =>
      callBedrock("us.anthropic.claude-opus-4-6-v1", prompt, imageUrls),
  },
  {
    name: "Bedrock (Claude Sonnet 4.5)",
    call: (prompt, imageUrls) =>
      callBedrock("us.anthropic.claude-sonnet-4-5-20250929-v1:0", prompt, imageUrls),
  },
  {
    name: "OpenRouter (Claude Opus 4.6)",
    call: (prompt, imageUrls) =>
      callOpenRouter("anthropic/claude-opus-4-6", prompt, imageUrls),
  },
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
