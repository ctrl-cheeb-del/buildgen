/**
 * Exponential backoff retry wrapper for Mistral API calls.
 * Catches 429/rate_limit errors and retries up to 3 times with
 * exponential backoff (2s, 4s, 8s).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 3,
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimit =
        err instanceof Error &&
        (err.message.includes("429") ||
          err.message.includes("rate_limit") ||
          err.message.includes("Rate limit") ||
          err.message.includes("Too many requests"));

      if (!isRateLimit || attempt === maxRetries) {
        throw err;
      }

      const delayMs = 2000 * Math.pow(2, attempt); // 2s, 4s, 8s
      console.warn(
        `[retry] ${label} rate-limited (attempt ${attempt + 1}/${maxRetries}), retrying in ${delayMs}ms...`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error(`[retry] ${label} exhausted all retries`);
}
