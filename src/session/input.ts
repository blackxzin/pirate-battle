import type { InputState } from '../game/types';

export type GameAction = keyof InputState;

export const KEY_BINDINGS: Readonly<Record<string, GameAction>> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyA: 'turnLeft',
  ArrowLeft: 'turnLeft',
  KeyD: 'turnRight',
  ArrowRight: 'turnRight',
  Space: 'fireFront',
  KeyQ: 'fireLeft',
  KeyE: 'fireRight',
};

export const PAUSE_KEYS: readonly string[] = ['Escape', 'KeyP'];

export const CONTROL_HELP: ReadonlyArray<{ readonly action: string; readonly keys: string }> = [
  { action: 'Sail forward', keys: 'W / ↑' },
  { action: 'Turn left / right', keys: 'A D / ← →' },
  { action: 'Front cannon', keys: 'Space' },
  { action: 'Left broadside', keys: 'Q' },
  { action: 'Right broadside', keys: 'E' },
  { action: 'Pause', keys: 'P / Esc' },
];

/**
 * Merges keyboard and on-screen (touch/pointer) input into one InputState.
 * Keyboard listeners are only attached while gameplay is active, so keys are
 * never captured in menus or dialogs.
 */
export class InputController {
  private readonly keys = new Map<string, GameAction>();
  private readonly virtual = new Set<GameAction>();
  private target: Window | null = null;
  private onPause: (() => void) | null = null;

  get state(): InputState {
    const active = new Set<GameAction>([...this.keys.values(), ...this.virtual]);
    return {
      forward: active.has('forward'),
      turnLeft: active.has('turnLeft'),
      turnRight: active.has('turnRight'),
      fireFront: active.has('fireFront'),
      fireLeft: active.has('fireLeft'),
      fireRight: active.has('fireRight'),
    };
  }

  get isAttached(): boolean {
    return this.target !== null;
  }

  attach(target: Window, onPause: () => void): void {
    if (this.target) return;
    this.target = target;
    this.onPause = onPause;
    target.addEventListener('keydown', this.handleKeyDown);
    target.addEventListener('keyup', this.handleKeyUp);
  }

  detach(): void {
    if (!this.target) return;
    this.target.removeEventListener('keydown', this.handleKeyDown);
    this.target.removeEventListener('keyup', this.handleKeyUp);
    this.target = null;
    this.onPause = null;
    this.reset();
  }

  /** Clears held keys so nothing carries over a pause or focus loss. */
  reset(): void {
    this.keys.clear();
    this.virtual.clear();
  }

  setVirtual(action: GameAction, pressed: boolean): void {
    if (!this.target) return;
    if (pressed) this.virtual.add(action);
    else this.virtual.delete(action);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    // Leave browser and OS shortcuts (Ctrl+W, Alt+←, ...) alone.
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (PAUSE_KEYS.includes(event.code)) {
      event.preventDefault();
      if (!event.repeat) this.onPause?.();
      return;
    }
    const action = KEY_BINDINGS[event.code];
    if (!action) return;
    event.preventDefault();
    this.keys.set(event.code, action);
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    if (!KEY_BINDINGS[event.code]) return;
    event.preventDefault();
    this.keys.delete(event.code);
  };
}
