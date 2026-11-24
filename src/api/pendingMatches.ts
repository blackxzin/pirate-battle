import { STORAGE_KEYS, readJson, writeJson } from '../storage/localStore';
import { isMatchRecord, type MatchRecord } from './contracts';

type Listener = () => void;

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/** Keeps every valid record: one corrupt entry must not discard the others. */
function readPending(): readonly MatchRecord[] {
  const stored = readJson(STORAGE_KEYS.pendingMatches, isArray) ?? [];
  const valid = stored.filter(isMatchRecord);
  if (valid.length !== stored.length) console.warn(`Dropped ${stored.length - valid.length} invalid pending match record(s).`);
  return valid;
}

/**
 * Outbox of completed matches not yet confirmed by the server. Persisted so a
 * refresh or crash never loses a result; entries leave only after a confirmed
 * (or idempotently replayed) submit.
 */
export class PendingMatchStore {
  private items: readonly MatchRecord[];
  private readonly listeners = new Set<Listener>();

  constructor() {
    this.items = readPending();
  }

  readonly getSnapshot = (): readonly MatchRecord[] => this.items;

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  has(matchId: string): boolean {
    return this.items.some((item) => item.matchId === matchId);
  }

  add(record: MatchRecord): void {
    if (this.has(record.matchId)) return;
    this.commit([...this.items, record]);
  }

  remove(matchId: string): void {
    if (!this.has(matchId)) return;
    this.commit(this.items.filter((item) => item.matchId !== matchId));
  }

  /** Re-reads storage (used after an external reset). */
  reload(): void {
    this.items = readPending();
    this.listeners.forEach((listener) => listener());
  }

  private commit(next: readonly MatchRecord[]): void {
    this.items = next;
    writeJson(STORAGE_KEYS.pendingMatches, next);
    this.listeners.forEach((listener) => listener());
  }
}

export const pendingMatches = new PendingMatchStore();
