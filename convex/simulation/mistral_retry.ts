/**
 * Track whether we've detected a monthly quota exhaustion.
 * Once set, all subsequent calls in this tick short-circuit immediately.
 */
let monthlyQuotaExhausted = false;

export function resetQuotaFlag() {
  monthlyQuotaExhausted = false;
}

function isMonthlyQuotaError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  // Mistral SDK attaches headers; check for remaining-tokens-month: 0
  const errAny = err as unknown as Record<string, unknown>;
  const headers = errAny.headers;
  if (headers && typeof (headers as Headers).get === "function") {
    const remaining = (headers as Headers).get("x-ratelimit-remaining-tokens-month");
    if (remaining === "0") return true;
  }
  return false;
}

/**
 * Exponential backoff retry wrapper for Mistral API calls.
 * - Short-circuits immediately if monthly quota is exhausted
 * - Adds jitter to avoid thundering herd on per-minute limits
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 3,
): Promise<T> {
  if (monthlyQuotaExhausted) {
    throw new Error(`[retry] ${label} skipped — monthly quota exhausted`);
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      // Check if monthly quota is gone — no point retrying
      if (isMonthlyQuotaError(err)) {
        monthlyQuotaExhausted = true;
        console.error(`[retry] ${label} — monthly token quota exhausted, skipping all remaining agents`);
        throw err;
      }

      const isRateLimit =
        err instanceof Error &&
        (err.message.includes("429") ||
          err.message.includes("rate_limit") ||
          err.message.includes("Rate limit") ||
          err.message.includes("Too many requests"));

      if (!isRateLimit || attempt === maxRetries) {
        throw err;
      }

      const maxMs = 2000 * Math.pow(2, attempt); // 2s, 4s, 8s
      const delayMs = Math.round(Math.random() * maxMs); // full jitter: uniform [0, maxMs]
      console.warn(
        `[retry] ${label} rate-limited (attempt ${attempt + 1}/${maxRetries}), retrying in ${delayMs}ms...`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error(`[retry] ${label} exhausted all retries`);
}
