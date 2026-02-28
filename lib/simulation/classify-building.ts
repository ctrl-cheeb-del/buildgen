export type BuildingCategory =
  | "residential"
  | "commercial"
  | "industrial"
  | "office"
  | "civic"
  | "entertainment"
  | "luxury";

const CATEGORY_KEYWORDS: Record<BuildingCategory, string[]> = {
  residential: [
    "house", "apartment", "home", "cottage", "villa", "flat", "townhouse",
    "duplex", "bungalow", "condo", "residence", "dwelling", "housing",
  ],
  commercial: [
    "shop", "market", "store", "cafe", "restaurant", "bar", "bakery",
    "boutique", "grocery", "deli", "pub", "diner", "mall", "retail",
  ],
  industrial: [
    "factory", "warehouse", "plant", "refinery", "depot", "foundry",
    "mill", "workshop", "forge", "smelter", "processing",
  ],
  office: [
    "office", "tower", "headquarters", "bank", "corporate", "co-working",
    "coworking", "startup", "firm",
  ],
  civic: [
    "school", "hospital", "police", "library", "fire station", "courthouse",
    "city hall", "post office", "clinic", "university", "church", "temple",
    "mosque", "government",
  ],
  entertainment: [
    "park", "stadium", "theater", "theatre", "museum", "gallery", "cinema",
    "arcade", "playground", "garden", "zoo", "aquarium", "arena", "club",
  ],
  luxury: [
    "mansion", "penthouse", "resort", "spa", "yacht club", "palace",
    "chateau", "estate", "casino", "rooftop", "skybar",
  ],
};

/** Classify a building prompt string into a category via keyword matching. */
export function classifyBuilding(prompt: string): BuildingCategory {
  const lower = prompt.toLowerCase();
  let best: BuildingCategory = "residential";
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw) && kw.length > bestScore) {
        best = category as BuildingCategory;
        bestScore = kw.length;
      }
    }
  }

  return best;
}
