import { Application } from 'pixi.js';
import { sound } from '../audio/sound';
import type { GameConfig } from '../game/config';
import { FIXED_STEP, Simulation } from '../game/simulation';
import type { EndReason, GameEvent, ShipKind, WorldSnapshot } from '../game/types';
import type { GameTextures } from '../render/assets';
import { GameRenderer } from '../render/gameRenderer';
import { FixedStepClock, FrameStats } from './clock';
import { InputController } from './input';
import { playEventSounds } from './soundEvents';
import { Store } from './store';

export type PauseReason = 'manual' | 'focus' | 'hidden' | 'portrait';

/** Same query as the `.rotate-hint` overlay in styles.css: phones held upright. */
export const PORTRAIT_QUERY = '(orientation: portrait) and (max-width: 820px)';
export type SessionPhase = 'running' | 'paused' | 'ended';

export interface HudState {
  readonly phase: SessionPhase;
  readonly pauseReason: PauseReason | null;
  readonly health: number;
  readonly maxHealth: number;
  readonly score: number;
  /** Whole seconds remaining (ceil), so the HUD changes once per second. */
  readonly secondsLeft: number;
  readonly endReason: EndReason | null;
}

export interface MatchOutcome {
  readonly score: number;
  readonly durationMs: number;
  readonly endReason: EndReason;
}

export interface SessionOptions {
  readonly host: HTMLElement;
  readonly textures: GameTextures;
  readonly config: GameConfig;
  readonly seed: number;
  /** When true the simulation only advances through `advance()` (tests). */
  readonly manualClock: boolean;
  readonly onEnd: (outcome: MatchOutcome) => void;
}

/** Thrown when a match cannot start (renderer unavailable or set-up failed). */
export class SessionStartError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'SessionStartError';
  }
}

const LOW_HEALTH_RATIO = 0.3;
const TIME_WARNING_SECONDS = 10;

/**
 * Owns one match: Pixi application, simulation, renderer, input, clock and
 * listeners. Everything it creates is released in `destroy()`, which is safe
 * to call at any point (including before `create` resolved).
 */
export class GameSession {
  readonly hud: Store<HudState>;
  readonly input = new InputController();
  readonly sim: Simulation;

  private readonly clock = new FixedStepClock(FIXED_STEP);
  private readonly frameStats = new FrameStats();
  private renderer: GameRenderer | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private portrait: MediaQueryList | null = null;
  private lastFrameTime = 0;
  private phase: SessionPhase = 'running';
  private destroyed = false;
  private endNotified = false;

  private constructor(
    private readonly app: Application,
    private readonly options: SessionOptions,
  ) {
    this.sim = new Simulation(options.config, options.seed);
    this.hud = new Store<HudState>(this.buildHud(null));
  }

  static async create(options: SessionOptions): Promise<GameSession> {
    const app = new Application();
    try {
      await app.init({
        background: 0x2a8fbd,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        resizeTo: options.host,
        preference: 'webgl',
      });
    } catch (error: unknown) {
      throw new SessionStartError('This device could not start the renderer (WebGL is unavailable).', error);
    }
    const session = new GameSession(app, options);
    try {
      session.mount();
    } catch (error: unknown) {
      // Release whatever mount attached before failing (listeners, canvas, app).
      session.destroy();
      throw new SessionStartError('The battle could not be started.', error);
    }
    return session;
  }

  get isManualClock(): boolean {
    return this.options.manualClock;
  }

  pause(reason: PauseReason): void {
    if (this.phase !== 'running' || this.destroyed) return;
    this.phase = 'paused';
    this.input.detach();
    this.clock.reset();
    this.app.ticker.stop();
    this.app.render();
    sound.stopLoops();
    sound.play('game_pause', 0.4);
    this.hud.update({ phase: 'paused', pauseReason: reason });
  }

  resume(): void {
    if (this.phase !== 'paused' || this.destroyed) return;
    this.phase = 'running';
    this.clock.reset();
    this.lastFrameTime = performance.now();
    this.attachInput();
    this.app.ticker.start();
    sound.play('game_resume', 0.4);
    sound.loop('ocean_ambience_loop', 0.18);
    this.hud.update({ phase: 'running', pauseReason: null });
  }

  /** Test instrumentation: advances simulated time while the match is running. */
  advance(ms: number): void {
    if (this.phase !== 'running' || this.destroyed) return;
    const steps = Math.round(ms / 1000 / FIXED_STEP);
    this.runSteps(steps);
  }

  spawnEnemy(kind: Exclude<ShipKind, 'player'>, x: number, y: number, angle?: number): number {
    return this.sim.addEnemy(kind, x, y, angle).id;
  }

  snapshot(): WorldSnapshot & { readonly phase: SessionPhase } {
    return { ...this.sim.snapshot(), phase: this.phase };
  }

  perfStats(): ReturnType<FrameStats['summary']> {
    return this.frameStats.summary();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.input.detach();
    window.removeEventListener('blur', this.handleBlur);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.portrait?.removeEventListener('change', this.handleOrientation);
    this.resizeObserver?.disconnect();
    this.app.ticker.remove(this.tick);
    sound.stopLoops();
    this.renderer?.destroy();
    this.renderer = null;
    this.hud.clear();
    // Keep cached atlas textures alive for the next match.
    this.app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
  }

  private mount(): void {
    const { host } = this.options;
    this.app.canvas.setAttribute('aria-hidden', 'true');
    this.app.canvas.dataset.testid = 'game-canvas';
    host.appendChild(this.app.canvas);
    this.renderer = new GameRenderer(this.app, this.options.textures, this.sim);
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(host);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('visibilitychange', this.handleVisibility);
    // In portrait the arena is covered by the rotate hint, so the match must not run unseen.
    this.portrait = window.matchMedia(PORTRAIT_QUERY);
    this.portrait.addEventListener('change', this.handleOrientation);
    this.attachInput();
    this.lastFrameTime = performance.now();
    this.app.ticker.add(this.tick);
    sound.play('game_start', 0.5);
    sound.loop('ocean_ambience_loop', 0.18);
    if (document.visibilityState === 'hidden') this.pause('hidden');
    else if (this.portrait.matches) this.pause('portrait');
  }

  private attachInput(): void {
    this.input.attach(window, () => this.pause('manual'));
  }

  private readonly tick = (): void => {
    const now = performance.now();
    const frameMs = now - this.lastFrameTime;
    this.lastFrameTime = now;
    if (this.destroyed) return;
    if (this.phase === 'running' && !this.options.manualClock) {
      this.runSteps(this.clock.consume(frameMs / 1000));
    } else if (this.phase === 'ended') {
      // Let explosions finish after the final whistle; the world is frozen.
      this.renderer?.render(frameMs / 1000, []);
    }
    const stats = this.renderer?.stats;
    this.frameStats.record(frameMs, stats ? stats.ships + stats.projectiles + stats.effects : 0);
  };

  private runSteps(steps: number): void {
    if (steps <= 0) return;
    const before = this.hud.getSnapshot();
    const events: GameEvent[] = [];
    let simulated = 0;
    for (let i = 0; i < steps && this.sim.isRunning; i += 1) {
      events.push(...this.sim.step(FIXED_STEP, this.input.state));
      simulated += FIXED_STEP;
    }
    this.renderer?.render(simulated, events);
    playEventSounds(events, this.sim.player.id);
    const ended = events.find((event): event is Extract<GameEvent, { type: 'ended' }> => event.type === 'ended');
    if (ended) this.finish(ended);
    const next = this.buildHud(ended?.reason ?? null);
    this.playWarnings(before, next);
    this.hud.set(next);
  }

  private finish(ended: Extract<GameEvent, { type: 'ended' }>): void {
    this.phase = 'ended';
    this.input.detach();
    if (this.endNotified) return;
    this.endNotified = true;
    this.options.onEnd({ score: ended.score, durationMs: Math.round(ended.elapsed * 1000), endReason: ended.reason });
  }

  private playWarnings(before: HudState, next: HudState): void {
    const lowBefore = before.health / before.maxHealth <= LOW_HEALTH_RATIO;
    const lowNow = next.health / next.maxHealth <= LOW_HEALTH_RATIO;
    if (!lowBefore && lowNow && next.health > 0) sound.play('health_low', 0.5);
    if (before.secondsLeft > TIME_WARNING_SECONDS && next.secondsLeft <= TIME_WARNING_SECONDS && next.secondsLeft > 0) {
      sound.play('time_warning', 0.5);
    }
  }

  private buildHud(endReason: EndReason | null): HudState {
    const snapshot = this.sim.snapshot();
    return {
      phase: this.phase,
      pauseReason: this.phase === 'paused' ? (this.hud?.getSnapshot().pauseReason ?? null) : null,
      health: Math.ceil(snapshot.player.health),
      maxHealth: snapshot.player.maxHealth,
      score: snapshot.score,
      secondsLeft: Math.ceil(snapshot.timeLeft - 1e-6),
      endReason: endReason ?? snapshot.endReason,
    };
  }

  private handleResize(): void {
    if (this.destroyed || !this.renderer) return;
    this.app.resize();
    this.renderer.resize(this.app.screen.width, this.app.screen.height);
    if (this.phase !== 'running') this.app.render();
  }

  private readonly handleBlur = (): void => this.pause('focus');

  private readonly handleOrientation = (event: MediaQueryListEvent): void => {
    if (event.matches) this.pause('portrait');
  };

  private readonly handleVisibility = (): void => {
    if (document.visibilityState === 'hidden') this.pause('hidden');
  };
}
