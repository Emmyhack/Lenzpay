/**
 * Identifier generation for orchestration objects.
 *
 * Deliberately not `crypto.randomUUID` — that isn't available on every React
 * Native runtime without a polyfill. These ids are local correlation handles
 * (plans, legs, ledger entries); the ids that must survive a retry are
 * idempotency keys, which are derived, not random. See `idempotency.ts`.
 */

const counters = new Map<string, number>();

export function nextId(prefix: string): string {
  const next = (counters.get(prefix) ?? 0) + 1;
  counters.set(prefix, next);
  const stamp = Date.now().toString(36);
  const seq = next.toString(36).padStart(3, '0');
  const noise = Math.floor(Math.random() * 46_656)
    .toString(36)
    .padStart(3, '0');
  return `${prefix}_${stamp}${seq}${noise}`;
}

/** Test helper — makes generated ids reproducible within a run. */
export function __resetIdCounters(): void {
  counters.clear();
}
