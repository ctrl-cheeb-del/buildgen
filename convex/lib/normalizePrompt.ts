/**
 * Normalize a building prompt for cache-key matching.
 * Pure function — no Convex imports.
 */
export function normalizePrompt(prompt: string): string {
  return prompt
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")          // collapse whitespace
    .replace(/^(a|an|the)\s+/, ""); // strip leading articles
}
