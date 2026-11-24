/**
 * Fixed-step accumulator. Real frame time is added and consumed in constant
 * steps so the simulation behaves the same at 30, 60 or 144 FPS. Long frames
 * are clamped to avoid a "spiral of death" after a stall.
 */
export class FixedStepClock {
  private accumulator = 0;

  constructor(
    readonly step: number,
    private readonly maxFrame = 0.25,
  ) {}

  /** Returns how many fixed steps should run for this frame. */
  consume(frameSeconds: number): number {
    this.accumulator += Math.min(Math.max(0, frameSeconds), this.maxFrame);
    const steps = Math.floor(this.accumulator / this.step + 1e-9);
    this.accumulator -= steps * this.step;
    return steps;
  }

  /** Drops any pending time (used on pause/resume). */
  reset(): void {
    this.accumulator = 0;
  }
}

/** Rolling frame-time statistics for profiling. */
export class FrameStats {
  private readonly samples: number[] = [];
  private frames = 0;
  private totalMs = 0;
  private maxEntities = 0;

  constructor(private readonly capacity = 600) {}

  record(frameMs: number, entities: number): void {
    this.frames += 1;
    this.totalMs += frameMs;
    this.maxEntities = Math.max(this.maxEntities, entities);
    this.samples.push(frameMs);
    if (this.samples.length > this.capacity) this.samples.shift();
  }

  summary(): { frames: number; averageFps: number; p95FrameMs: number; maxEntities: number } {
    const sorted = [...this.samples].sort((a, b) => a - b);
    const p95 = sorted.length > 0 ? (sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0) : 0;
    return {
      frames: this.frames,
      averageFps: this.totalMs > 0 ? (this.frames * 1000) / this.totalMs : 0,
      p95FrameMs: Number(p95.toFixed(2)),
      maxEntities: this.maxEntities,
    };
  }
}
