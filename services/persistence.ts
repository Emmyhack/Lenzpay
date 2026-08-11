/**
 * Persistence.
 *
 * Everything in this app lived in memory. Killing the app reset linked
 * accounts, reward balances, security settings — and, more seriously, the
 * collection queue, float exposure and idempotency keys. Those last three are
 * money:
 *
 *  - a lost collection queue means legs the float already paid out are never
 *    debited, which is revenue walking out the door;
 *  - a lost idempotency key means a retry after a restart can charge twice.
 *
 * `react-native-mmkv` was already a dependency and entirely unused. This wires
 * it up behind an interface, so the storage engine is swappable and — crucially
 * — so the money logic stays testable outside a React Native runtime.
 */

// ---------------------------------------------------------------------------
// Storage engine
// ---------------------------------------------------------------------------

export interface KeyValueStore {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
  getAllKeys(): string[];
}

/** In-memory fallback. Used by tests, and if the native module is missing. */
export function createMemoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getString: (key) => map.get(key),
    set: (key, value) => void map.set(key, value),
    delete: (key) => void map.delete(key),
    getAllKeys: () => [...map.keys()],
  };
}

let store: KeyValueStore | null = null;

/**
 * The active store, created on first use.
 *
 * MMKV is required lazily and inside a try/catch. It is a native module, so a
 * top-level import would break every Node test that transitively reaches this
 * file — and the engine tests reach it through the treasury.
 */
export function getStore(): KeyValueStore {
  if (store) return store;

  try {
    // MMKV v4 replaced `new MMKV()` with a factory, and `delete()` with
    // `remove()`. Requiring lazily also means the API shape is only reached at
    // runtime on a device, never during a Node test run.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createMMKV } = require('react-native-mmkv') as typeof import('react-native-mmkv');
    const mmkv = createMMKV({ id: 'lenzpay' });
    store = {
      getString: (key) => mmkv.getString(key),
      set: (key, value) => mmkv.set(key, value),
      delete: (key) => void mmkv.remove(key),
      getAllKeys: () => mmkv.getAllKeys(),
    };
  } catch {
    // No native module (Node tests, web without the polyfill). In-memory keeps
    // behaviour identical for a session; only durability is lost.
    store = createMemoryStore();
  }

  return store;
}

/** Swap the storage engine. Tests use this to simulate a fresh install. */
export function setStore(next: KeyValueStore | null): void {
  store = next;
}

// ---------------------------------------------------------------------------
// Codec
// ---------------------------------------------------------------------------

const DATE_TAG = '__lenzDate';

/**
 * JSON with `Date` support.
 *
 * Plain `JSON.stringify` turns a Date into a string, and nothing turns it back
 * — so a rehydrated `PaymentSource.lastSynced` would be a string that still
 * *looks* fine until something calls `.getTime()` on it. Collection confidence
 * does exactly that, and would have silently scored every restored source as
 * infinitely stale. Tagging dates explicitly avoids guessing at parse time.
 */
export function encode(value: unknown): string {
  // Must be a `function`, not an arrow, and must read `this[key]` rather than
  // the passed value: `JSON.stringify` calls `Date.prototype.toJSON` *before*
  // handing the value to the replacer, so by then a Date has already become a
  // string and `instanceof Date` is false. `this` is the holder object, which
  // still has the original.
  return JSON.stringify(value, function replacer(key, serialised) {
    const original = (this as Record<string, unknown>)[key];
    if (original instanceof Date) return { [DATE_TAG]: original.toISOString() };
    return serialised;
  });
}

export function decode<T>(raw: string): T {
  return JSON.parse(raw, (_key, value) => {
    if (value && typeof value === 'object' && typeof value[DATE_TAG] === 'string') {
      return new Date(value[DATE_TAG]);
    }
    return value;
  }) as T;
}

// ---------------------------------------------------------------------------
// Typed read/write
// ---------------------------------------------------------------------------

export function read<T>(key: string): T | undefined {
  const raw = getStore().getString(key);
  if (raw === undefined) return undefined;
  try {
    return decode<T>(raw);
  } catch {
    // Corrupt or from an incompatible build. Drop it rather than crash on
    // launch — a lost preference is recoverable, a boot loop is not.
    getStore().delete(key);
    return undefined;
  }
}

export function write(key: string, value: unknown): void {
  try {
    getStore().set(key, encode(value));
  } catch {
    // Storage full or unavailable. Losing a write is survivable; throwing out
    // of a state setter is not.
  }
}

export function remove(key: string): void {
  getStore().delete(key);
}

/** Wipe everything under a namespace. Used on sign-out. */
export function clearNamespace(prefix: string): void {
  for (const key of getStore().getAllKeys()) {
    if (key.startsWith(prefix)) getStore().delete(key);
  }
}

// ---------------------------------------------------------------------------
// Zustand integration
// ---------------------------------------------------------------------------

export interface StateStorageLike {
  getItem: (name: string) => string | null;
  setItem: (name: string, value: string) => void;
  removeItem: (name: string) => void;
}

/**
 * Storage adapter for zustand's `persist`. Synchronous, because MMKV is —
 * which means state is available on the first render with no rehydration
 * flicker.
 */
export const zustandStorage: StateStorageLike = {
  getItem: (name) => getStore().getString(name) ?? null,
  setItem: (name, value) => getStore().set(name, value),
  removeItem: (name) => getStore().delete(name),
};

/**
 * `persist` serialises with plain JSON, so Dates need the same treatment as
 * everywhere else. Pass this as the `storage` option.
 */
export const dateSafeJsonStorage = {
  getItem: (name: string) => {
    const raw = getStore().getString(name);
    return raw ? decode<{ state: unknown; version?: number }>(raw) : null;
  },
  setItem: (name: string, value: { state: unknown; version?: number }) => {
    getStore().set(name, encode(value));
  },
  removeItem: (name: string) => getStore().delete(name),
};

/** Namespaced keys, so `clearNamespace` and debugging both stay tractable. */
export const StorageKeys = {
  sources: 'lenz.store.sources',
  security: 'lenz.store.security',
  rewards: 'lenz.store.rewards',
  merchant: 'lenz.store.merchant',
  auth: 'lenz.store.auth',
  collections: 'lenz.engine.collections',
  treasury: 'lenz.engine.treasury',
  idempotency: 'lenz.engine.idempotency',
  spendLedger: 'lenz.engine.spend',
} as const;
