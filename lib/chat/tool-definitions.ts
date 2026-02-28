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
- building, creating, constructing, making something → call "create_building" with a short description
- general chat with no action → reply in 1 sentence max

always call the tool, don't describe what it does. you can add a super short casual comment alongside (under 8 words). write in all lowercase, keep it chill and brief. no exclamation marks. no capitalization.`;
