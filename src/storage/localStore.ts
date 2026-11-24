/**
 * Tiny JSON persistence helpers over localStorage with validation. Falls back
 * to memory when storage is unavailable (private mode, Node tests).
 */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const memory = new Map<string, string>();
const memoryStorage: KeyValueStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => void memory.set(key, value),
  removeItem: (key) => void memory.delete(key),
};

function resolveStorage(): KeyValueStorage {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return memoryStorage;
    const probe = '__pirate_battle_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return memoryStorage;
  }
}

let storage: KeyValueStorage | null = null;

export function getStorage(): KeyValueStorage {
  storage ??= resolveStorage();
  return storage;
}

export const STORAGE_KEYS = {
  options: 'pirate-battle:options:v1',
  player: 'pirate-battle:player:v1',
  lastResult: 'pirate-battle:last-result:v1',
  pendingMatches: 'pirate-battle:pending-matches:v1',
  mockDb: 'pirate-battle:mock-db:v1',
  mockScenario: 'pirate-battle:mock-scenario:v1',
} as const;

export function readJson<T>(key: string, isValid: (value: unknown) => value is T): T | null {
  const raw = getStorage().getItem(key);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isValid(parsed)) return parsed;
    console.warn(`Ignoring invalid persisted data for "${key}".`);
    return null;
  } catch (error: unknown) {
    console.warn(`Ignoring corrupt persisted data for "${key}".`, error);
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    getStorage().setItem(key, JSON.stringify(value));
  } catch (error: unknown) {
    console.warn(`Could not persist "${key}".`, error);
  }
}

export function removeKey(key: string): void {
  getStorage().removeItem(key);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
