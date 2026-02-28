/**
 * Tileable texture definitions.
 * Prompts are kept short — nano-banana-2 works best with concise descriptions.
 */

export interface TextureDefinition {
  /** Unique key used for filenames and lookup */
  id: string;
  /** Human-readable name */
  name: string;
  /** Prompt sent to Replicate for image generation */
  prompt: string;
  /** Suggested Three.js repeat count (per 30m plot side) */
  repeat: number;
  /** Suggested roughness value for MeshPhysicalMaterial */
  roughness: number;
  /** Suggested metalness value for MeshPhysicalMaterial */
  metalness: number;
}

export const TEXTURE_DEFS: TextureDefinition[] = [
  // ── Ground / Paving ──────────────────────────────────────────
  {
    id: "pavement-slabs",
    name: "Concrete Pavement Slabs",
    prompt: "seamless tileable texture of grey concrete pavement slabs, top down view, flat even lighting, square grid pattern with grouted joints",
    repeat: 8,
    roughness: 0.85,
    metalness: 0.0,
  },
  {
    id: "asphalt",
    name: "Asphalt Road",
    prompt: "seamless tileable texture of dark asphalt road surface, top down view, flat lighting, fine aggregate with small embedded stones",
    repeat: 6,
    roughness: 0.92,
    metalness: 0.0,
  },
  {
    id: "cobblestone",
    name: "Cobblestone",
    prompt: "seamless tileable texture of cobblestone pavement, top down view, flat lighting, rounded grey and tan stone cobbles with sand joints",
    repeat: 6,
    roughness: 0.9,
    metalness: 0.0,
  },

  // ── Nature ───────────────────────────────────────────────────
  {
    id: "grass",
    name: "Green Grass Lawn",
    prompt: "seamless tileable texture of green grass lawn, top down view, flat lighting, dense short cut grass blades, vibrant natural green",
    repeat: 4,
    roughness: 0.95,
    metalness: 0.0,
  },
  {
    id: "dirt",
    name: "Packed Dirt / Soil",
    prompt: "seamless tileable texture of packed brown dirt ground, top down view, flat lighting, dry compacted earth with fine gravel",
    repeat: 4,
    roughness: 0.95,
    metalness: 0.0,
  },
  {
    id: "gravel",
    name: "Gravel Path",
    prompt: "seamless tileable texture of small grey gravel, top down view, flat lighting, loose crushed stones in grey and beige tones",
    repeat: 5,
    roughness: 0.95,
    metalness: 0.0,
  },
  {
    id: "sand",
    name: "Sand",
    prompt: "seamless tileable texture of fine beach sand, top down view, flat lighting, smooth warm beige sand with subtle grain",
    repeat: 4,
    roughness: 0.98,
    metalness: 0.0,
  },

  // ── Architectural surfaces ───────────────────────────────────
  {
    id: "brick-red",
    name: "Red Brick Wall",
    prompt: "seamless tileable texture of red brick wall, front view, flat lighting, running bond brickwork with grey mortar joints",
    repeat: 6,
    roughness: 0.85,
    metalness: 0.0,
  },
  {
    id: "concrete-smooth",
    name: "Smooth Concrete",
    prompt: "seamless tileable texture of smooth poured concrete wall, front view, flat lighting, light grey with subtle surface pores",
    repeat: 3,
    roughness: 0.75,
    metalness: 0.05,
  },
  {
    id: "wood-decking",
    name: "Wood Decking",
    prompt: "seamless tileable texture of wooden deck boards, top down view, flat lighting, parallel oak timber planks with narrow gaps",
    repeat: 6,
    roughness: 0.8,
    metalness: 0.0,
  },
  {
    id: "metal-grating",
    name: "Metal Grating",
    prompt: "seamless tileable texture of steel diamond plate floor, top down view, flat lighting, raised diamond tread pattern on brushed metal",
    repeat: 8,
    roughness: 0.4,
    metalness: 0.8,
  },
  {
    id: "roof-tiles",
    name: "Clay Roof Tiles",
    prompt: "seamless tileable texture of terracotta clay roof tiles, front view, flat lighting, overlapping rows of curved reddish brown tiles",
    repeat: 8,
    roughness: 0.8,
    metalness: 0.0,
  },
];
