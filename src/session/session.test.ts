import { describe, expect, it, vi } from 'vitest';
import { FixedStepClock, FrameStats } from './clock';
import { InputController } from './input';
import { Store } from './store';

describe('FixedStepClock', () => {
  it('turns frame time into whole fixed steps and keeps the remainder', () => {
    const clock = new FixedStepClock(1 / 60);
    expect(clock.consume(1 / 60)).toBe(1);
    expect(clock.consume(1 / 120)).toBe(0);
    expect(clock.consume(1 / 120)).toBe(1);
  });

  it('clamps long frames to avoid a spiral of death', () => {
    const clock = new FixedStepClock(1 / 60, 0.25);
    expect(clock.consume(10)).toBe(15);
  });

  it('ignores negative frame time and drops pending time on reset', () => {
    const clock = new FixedStepClock(1 / 60);
    expect(clock.consume(-1)).toBe(0);
    clock.consume(1 / 90);
    clock.reset();
    expect(clock.consume(1 / 120)).toBe(0);
  });
});

describe('FrameStats', () => {
  it('reports average FPS, p95 frame time and peak entities', () => {
    const stats = new FrameStats(100);
    for (let i = 0; i < 95; i += 1) stats.record(10, 5);
    for (let i = 0; i < 5; i += 1) stats.record(40, 12);
    const summary = stats.summary();
    expect(summary.frames).toBe(100);
    expect(summary.averageFps).toBeCloseTo(1000 / 11.5, 5);
    expect(summary.p95FrameMs).toBe(40);
    expect(summary.maxEntities).toBe(12);
  });

  it('keeps a rolling window and returns zeros when empty', () => {
    expect(new FrameStats().summary()).toEqual({ frames: 0, averageFps: 0, p95FrameMs: 0, maxEntities: 0 });
    const stats = new FrameStats(2);
    stats.record(50, 1);
    stats.record(5, 1);
    stats.record(5, 1);
    expect(stats.summary().p95FrameMs).toBe(5);
  });
});

describe('Store', () => {
  it('notifies only when a value actually changes', () => {
    const store = new Store({ score: 0, health: 100 });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.update({ score: 0 });
    expect(listener).not.toHaveBeenCalled();
    store.update({ score: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toEqual({ score: 1, health: 100 });

    unsubscribe();
    store.update({ score: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('returns a new snapshot object on change (immutable for React)', () => {
    const store = new Store({ score: 0 });
    const before = store.getSnapshot();
    store.set({ score: 3 });
    expect(store.getSnapshot()).not.toBe(before);
    expect(before.score).toBe(0);
  });

  it('drops every listener on clear', () => {
    const store = new Store({ value: 0 });
    const listener = vi.fn();
    store.subscribe(listener);
    store.clear();
    store.set({ value: 1 });
    expect(listener).not.toHaveBeenCalled();
  });
});

function keyEvent(type: 'keydown' | 'keyup', code: string, repeat = false): Event {
  return Object.assign(new Event(type, { cancelable: true }), { code, repeat });
}

function attached(): { input: InputController; target: EventTarget; onPause: ReturnType<typeof vi.fn> } {
  const input = new InputController();
  const target = new EventTarget();
  const onPause = vi.fn();
  input.attach(target as unknown as Window, onPause);
  return { input, target, onPause };
}

describe('InputController', () => {
  it('maps bound keys to actions and allows moving while firing', () => {
    const { input, target } = attached();
    const down = keyEvent('keydown', 'KeyW');
    target.dispatchEvent(down);
    target.dispatchEvent(keyEvent('keydown', 'Space'));
    target.dispatchEvent(keyEvent('keydown', 'ArrowLeft'));

    expect(down.defaultPrevented).toBe(true);
    expect(input.state).toMatchObject({ forward: true, fireFront: true, turnLeft: true, turnRight: false });

    target.dispatchEvent(keyEvent('keyup', 'KeyW'));
    expect(input.state.forward).toBe(false);
  });

  it('keeps an action held while any of its keys is down', () => {
    const { input, target } = attached();
    target.dispatchEvent(keyEvent('keydown', 'KeyW'));
    target.dispatchEvent(keyEvent('keydown', 'ArrowUp'));
    target.dispatchEvent(keyEvent('keyup', 'KeyW'));
    expect(input.state.forward).toBe(true);
  });

  it('leaves unbound keys alone (no preventDefault)', () => {
    const { input, target } = attached();
    const other = keyEvent('keydown', 'KeyZ');
    target.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
    expect(Object.values(input.state).some(Boolean)).toBe(false);
  });

  it('ignores key presses with Ctrl, Alt or Meta (browser shortcuts)', () => {
    const { input, target, onPause } = attached();
    const shortcut = Object.assign(keyEvent('keydown', 'KeyW'), { ctrlKey: true });
    target.dispatchEvent(shortcut);
    target.dispatchEvent(Object.assign(keyEvent('keydown', 'ArrowLeft'), { altKey: true }));
    target.dispatchEvent(Object.assign(keyEvent('keydown', 'KeyP'), { metaKey: true }));
    expect(shortcut.defaultPrevented).toBe(false);
    expect(Object.values(input.state).some(Boolean)).toBe(false);
    expect(onPause).not.toHaveBeenCalled();
  });

  it('requests a pause once per press of Escape or P', () => {
    const { target, onPause } = attached();
    target.dispatchEvent(keyEvent('keydown', 'Escape'));
    target.dispatchEvent(keyEvent('keydown', 'Escape', true));
    target.dispatchEvent(keyEvent('keydown', 'KeyP'));
    expect(onPause).toHaveBeenCalledTimes(2);
  });

  it('merges on-screen controls and clears everything on detach', () => {
    const { input, target } = attached();
    input.setVirtual('fireLeft', true);
    target.dispatchEvent(keyEvent('keydown', 'KeyD'));
    expect(input.state).toMatchObject({ fireLeft: true, turnRight: true });

    input.detach();
    expect(input.isAttached).toBe(false);
    expect(Object.values(input.state).some(Boolean)).toBe(false);

    // Detached: keys and on-screen presses are ignored (not captured in menus).
    target.dispatchEvent(keyEvent('keydown', 'KeyW'));
    input.setVirtual('forward', true);
    expect(input.state.forward).toBe(false);
  });

  it('reset releases held keys without detaching', () => {
    const { input, target } = attached();
    target.dispatchEvent(keyEvent('keydown', 'KeyE'));
    input.reset();
    expect(input.state.fireRight).toBe(false);
    expect(input.isAttached).toBe(true);
  });
});
