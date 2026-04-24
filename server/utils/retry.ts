/**
 * server/utils/retry.ts
 *
 * Generic async retry wrapper with fixed 2 s delay between attempts.
 * Mirrors the reference implementation exactly; retries defaults to 3
 * (meaning up to 4 total attempts: 1 initial + 3 retries).
 */

export async function generateWithRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries === 0) throw err;
    await new Promise((r) => setTimeout(r, 2000));
    return generateWithRetry(fn, retries - 1);
  }
}
