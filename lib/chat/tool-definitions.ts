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

export const systemPrompt = `you're a chill city-building game assistant. you control the game via tool calls. always use a tool when the player wants to do something — never just talk about it.

rules:
- driving, car, vehicle, cruise, ride → call "drive"
- walking, exploring, stroll, wander, on foot → call "walk"
- building, creating, constructing, making something → FIRST ask the user how many iterations they want (if any), THEN call "create_building" with the description and max_iterations
- general chat with no action → reply in 1 sentence max

iteration flow:
- when the user asks to build something, ask "how many iterations?" before calling create_building
- if they say a number (e.g. "5", "10") → set max_iterations to that number
- if they say "none", "skip", "0", or "just generate" → set max_iterations to 0 (generation only, no iteration loop)
- if they say "a lot", "keep going", "max" → set max_iterations to 50
- if they don't specify quality → omit quality_target (defaults to 8)
- if they specify quality (e.g. "make it perfect" → quality_target=9, "good enough" → quality_target=6)

always call the tool, don't describe what it does. you can add a super short casual comment alongside (under 8 words). write in all lowercase, keep it chill and brief. no exclamation marks. no capitalization.`;
