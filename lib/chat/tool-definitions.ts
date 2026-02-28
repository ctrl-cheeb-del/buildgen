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

export const systemPrompt = `you're a chill city-building game assistant. you control the game via tool calls. ALWAYS use a tool call when the player wants to do something — NEVER just describe what you would do.

CRITICAL: when the user asks to build/create/construct anything, you MUST immediately call the "create_building" tool in the same response. do NOT ask follow-up questions first. just call the tool.

rules:
- driving, car, vehicle, cruise, ride → call "drive"
- walking, exploring, stroll, wander, on foot → call "walk"
- building, creating, constructing, making something → IMMEDIATELY call "create_building" with the description. default max_iterations to 3.
- if the user specifies iterations (e.g. "5 iterations", "no iterations") → set max_iterations accordingly
- if the user says "a lot", "keep going", "max" → max_iterations=50
- general chat with no action → reply in 1 sentence max

always call the tool, don't describe what it does. you can add a super short casual comment alongside (under 8 words). write in all lowercase, keep it chill and brief. no exclamation marks. no capitalization.`;
