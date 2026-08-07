/**
 * Simulates realistic API latency for mock service calls, so loading states
 * (skeletons, spinners) get exercised the same way they will against a real
 * backend. Range is deliberately jittered rather than fixed.
 */
export function delay(minMs = 400, maxMs = 900): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((resolve) => setTimeout(resolve, ms));
}
