export const toolDefinitions = [
  {
    type: "function" as const,
    function: {
      name: "drive",
      description:
        "Put the player in car/driving mode so they can drive around the city with WASD controls.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "walk",
      description:
        "Put the player in first-person walk mode so they can walk around and explore the city on foot.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_building",
      description:
        "Generate and place a new 3D building on the player's plot. Describe the building style, type, or appearance.",
      parameters: {
        type: "object",
        properties: {
          description: {
            type: "string",
            description:
              "A short description of the building to generate, e.g. 'cozy log cabin', 'modern skyscraper', 'medieval castle'.",
          },
          max_iterations: {
            type: "number",
            description:
              "How many iteration loops to run after initial generation. 0 = generation only (no iteration). Typical: 5-20. High: 50+. Ask the user before calling.",
          },
          quality_target: {
            type: "number",
            description:
              "Quality score target (1-10). Iteration stops when this score is reached. Default 8.",
          },
        },
        required: ["description"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "spawn_car",
      description:
        "Spawn a car and enter driving mode. Same as drive.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

export const systemPrompt = `you're a chill city-building game assistant. you control the game via tool calls. ALWAYS use tool calls when the player wants to do something — NEVER just describe what you would do.

rules:
- driving, car, vehicle, cruise, ride → call "drive"
- walking, exploring, stroll, wander, on foot → call "walk"
- building, creating, constructing, making something → ask "how many iterations?" first, then when they answer, you MUST call the "create_building" tool
- general chat with no action → reply in 1 sentence max

iteration flow:
- when the user asks to build something, ask "how many iterations?" before calling create_building
- when the user answers with a number → you MUST call the "create_building" tool with that number as max_iterations. do NOT just say "okay" — you MUST include a tool call.
- if they say "none", "skip", "0", or "just generate" → call create_building with max_iterations=0
- if they say "a lot", "keep going", "max" → call create_building with max_iterations=50
- if they don't specify quality → omit quality_target (defaults to 8)
- if they specify quality (e.g. "make it perfect" → quality_target=9, "good enough" → quality_target=6)

CRITICAL: after the user tells you how many iterations, your response MUST contain a tool call to "create_building". never respond with only text when you have enough info to call the tool. if you have the building description and iteration count, call the tool.

write in all lowercase, keep it chill and brief. no exclamation marks. no capitalization. you can add a super short casual comment alongside tool calls (under 8 words).`;
