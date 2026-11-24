type Listener = () => void;

function shallowEqual<T extends object>(a: T, b: T): boolean {
  const keysA = Object.keys(a) as Array<keyof T>;
  if (keysA.length !== Object.keys(b).length) return false;
  return keysA.every((key) => Object.is(a[key], b[key]));
}

/**
 * Minimal external store for useSyncExternalStore. `set` only notifies when a
 * value actually changes, so React re-renders when the HUD changes (score,
 * whole seconds, health), never once per frame.
 */
export class Store<T extends object> {
  private snapshot: T;
  private readonly listeners = new Set<Listener>();

  constructor(initial: T) {
    this.snapshot = initial;
  }

  readonly getSnapshot = (): T => this.snapshot;

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  set(next: T): void {
    if (shallowEqual(this.snapshot, next)) return;
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }

  update(partial: Partial<T>): void {
    this.set({ ...this.snapshot, ...partial });
  }

  clear(): void {
    this.listeners.clear();
  }
}
