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
  /** Normal map intensity (THREE.Vector2 scale). Structured textures ~1.2-1.5, organic ~0.2-0.3 */
  normalScale?: number;
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
    normalScale: 1.3,
  },
  {
    id: "asphalt",
    name: "Asphalt Road",
    prompt: "seamless tileable texture of dark asphalt road surface, top down view, flat lighting, fine aggregate with small embedded stones",
    repeat: 6,
    roughness: 0.92,
    metalness: 0.0,
    normalScale: 0.8,
  },
  {
    id: "cobblestone",
    name: "Cobblestone",
    prompt: "seamless tileable texture of cobblestone pavement, top down view, flat lighting, rounded grey and tan stone cobbles with sand joints",
    repeat: 6,
    roughness: 0.9,
    metalness: 0.0,
    normalScale: 1.5,
  },

  // ── Nature ───────────────────────────────────────────────────
  {
    id: "grass",
    name: "Green Grass Lawn",
    prompt: "seamless tileable texture of green grass lawn, top down view, flat lighting, dense short cut grass blades, vibrant natural green",
    repeat: 4,
    roughness: 0.95,
    metalness: 0.0,
    normalScale: 0.25,
  },
  {
    id: "dirt",
    name: "Packed Dirt / Soil",
    prompt: "seamless tileable texture of packed brown dirt ground, top down view, flat lighting, dry compacted earth with fine gravel",
    repeat: 4,
    roughness: 0.95,
    metalness: 0.0,
    normalScale: 0.5,
  },
  {
    id: "gravel",
    name: "Gravel Path",
    prompt: "seamless tileable texture of small grey gravel, top down view, flat lighting, loose crushed stones in grey and beige tones",
    repeat: 5,
    roughness: 0.95,
    metalness: 0.0,
    normalScale: 1.0,
  },
  {
    id: "sand",
    name: "Sand",
    prompt: "seamless tileable texture of fine beach sand, top down view, flat lighting, smooth warm beige sand with subtle grain",
    repeat: 4,
    roughness: 0.98,
    metalness: 0.0,
    normalScale: 0.2,
  },

  // ── Architectural surfaces ───────────────────────────────────

  // Brick
  {
    id: "brick-red",
    name: "Red Brick Wall",
    prompt: "seamless tileable texture of red brick wall, front view, flat lighting, running bond brickwork with grey mortar joints",
    repeat: 6,
    roughness: 0.85,
    metalness: 0.0,
    normalScale: 1.4,
  },
  {
    id: "brick-white",
    name: "White Brick Wall",
    prompt: "seamless tileable texture of white painted brick wall, front view, flat lighting, running bond pattern with thin mortar joints",
    repeat: 6,
    roughness: 0.8,
    metalness: 0.0,
    normalScale: 1.2,
  },
  {
    id: "brick-dark",
    name: "Dark Brick Wall",
    prompt: "seamless tileable texture of dark charcoal grey brick wall, front view, flat lighting, stretcher bond with dark mortar joints",
    repeat: 6,
    roughness: 0.85,
    metalness: 0.0,
    normalScale: 1.3,
  },

  // Concrete
  {
    id: "concrete-smooth",
    name: "Smooth Concrete",
    prompt: "seamless tileable texture of smooth poured concrete wall, front view, flat lighting, light grey with subtle surface pores",
    repeat: 3,
    roughness: 0.75,
    metalness: 0.05,
    normalScale: 0.3,
  },
  {
    id: "concrete-exposed",
    name: "Exposed Concrete",
    prompt: "seamless tileable texture of exposed aggregate concrete wall, front view, flat lighting, rough grey surface with visible pebbles and formwork marks",
    repeat: 4,
    roughness: 0.9,
    metalness: 0.0,
    normalScale: 1.0,
  },
  {
    id: "concrete-precast",
    name: "Precast Concrete Panel",
    prompt: "seamless tileable texture of precast concrete panel, front view, flat lighting, smooth light grey with subtle grid joints and uniform surface",
    repeat: 3,
    roughness: 0.7,
    metalness: 0.05,
    normalScale: 0.4,
  },

  // Wood
  {
    id: "wood-decking",
    name: "Wood Decking",
    prompt: "seamless tileable texture of wooden deck boards, top down view, flat lighting, parallel oak timber planks with narrow gaps",
    repeat: 6,
    roughness: 0.8,
    metalness: 0.0,
    normalScale: 0.8,
  },
  {
    id: "wood-siding",
    name: "Wood Clapboard Siding",
    prompt: "seamless tileable texture of horizontal wood clapboard siding, front view, flat lighting, overlapping painted timber boards in natural pale tone",
    repeat: 8,
    roughness: 0.75,
    metalness: 0.0,
    normalScale: 0.7,
  },
  {
    id: "wood-plywood",
    name: "Plywood Panel",
    prompt: "seamless tileable texture of birch plywood panel, front view, flat lighting, light tan wood grain with subtle lamination layers",
    repeat: 3,
    roughness: 0.7,
    metalness: 0.0,
    normalScale: 0.3,
  },

  // Metal
  {
    id: "metal-grating",
    name: "Metal Grating",
    prompt: "seamless tileable texture of steel diamond plate floor, top down view, flat lighting, raised diamond tread pattern on brushed metal",
    repeat: 8,
    roughness: 0.4,
    metalness: 0.8,
    normalScale: 1.2,
  },
  {
    id: "steel-panel",
    name: "Steel Cladding Panel",
    prompt: "seamless tileable texture of corrugated steel cladding panel, front view, flat lighting, vertical ribbed metal sheet in silver grey",
    repeat: 6,
    roughness: 0.35,
    metalness: 0.7,
    normalScale: 1.0,
  },
  {
    id: "copper-patina",
    name: "Copper Patina",
    prompt: "seamless tileable texture of aged copper cladding with green verdigris patina, front view, flat lighting, mottled teal green oxidized surface",
    repeat: 4,
    roughness: 0.6,
    metalness: 0.5,
    normalScale: 0.5,
  },
  {
    id: "metal-zinc",
    name: "Zinc Cladding",
    prompt: "seamless tileable texture of zinc metal cladding, front view, flat lighting, matte grey blue surface with subtle standing seam joints",
    repeat: 4,
    roughness: 0.5,
    metalness: 0.6,
    normalScale: 0.6,
  },

  // Glass
  {
    id: "glass-curtainwall",
    name: "Glass Curtain Wall",
    prompt: "seamless tileable texture of blue reflective glass curtain wall, front view, flat lighting, grid of glass panels with thin aluminium mullions",
    repeat: 4,
    roughness: 0.1,
    metalness: 0.5,
  },
  {
    id: "glass-frosted",
    name: "Frosted Glass",
    prompt: "seamless tileable texture of frosted translucent glass panel, front view, flat lighting, uniform milky white diffused surface with subtle grain",
    repeat: 3,
    roughness: 0.4,
    metalness: 0.2,
  },

  // Stone
  {
    id: "stone-ashlar",
    name: "Ashlar Stone",
    prompt: "seamless tileable texture of cut ashlar limestone wall, front view, flat lighting, rectangular cream colored stone blocks with thin mortar joints",
    repeat: 4,
    roughness: 0.85,
    metalness: 0.0,
    normalScale: 1.0,
  },
  {
    id: "stone-granite",
    name: "Polished Granite",
    prompt: "seamless tileable texture of polished grey granite surface, front view, flat lighting, dark grey speckled stone with reflective polish",
    repeat: 3,
    roughness: 0.3,
    metalness: 0.1,
    normalScale: 0.3,
  },

  // Other
  {
    id: "stucco-white",
    name: "White Stucco",
    prompt: "seamless tileable texture of white plaster wall, front view, flat lighting, slightly rough rendered surface with fine bumpy texture",
    repeat: 4,
    roughness: 0.85,
    metalness: 0.0,
    normalScale: 0.4,
  },
  {
    id: "terracotta-panel",
    name: "Terracotta Panel",
    prompt: "seamless tileable texture of terracotta rainscreen cladding panels, front view, flat lighting, warm reddish brown ceramic panels with thin horizontal joints",
    repeat: 6,
    roughness: 0.75,
    metalness: 0.0,
    normalScale: 0.8,
  },
  {
    id: "roof-tiles",
    name: "Clay Roof Tiles",
    prompt: "seamless tileable texture of terracotta clay roof tiles, front view, flat lighting, overlapping rows of curved reddish brown tiles",
    repeat: 8,
    roughness: 0.8,
    metalness: 0.0,
    normalScale: 1.3,
  },
];
