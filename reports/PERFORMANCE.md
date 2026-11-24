# Performance report

The target is **60 FPS** in the reference environment below. Combat is measured in the optimized production build (`vite build` + `vite preview`), during **one full 3-minute match**.

The raw data is in [`perf/`](perf):

- `combat-profile-*.json`: samples every 15 s;
- `memory-cycles-*.json`: heap after each start/play/exit cycle.

## Reference environment

| | |
| --- | --- |
| CPU | AMD Ryzen 5 4600G (6 cores / 12 threads) |
| GPU | AMD Radeon RX 580 2048SP (Mesa radeonsi, OpenGL 4.6 through ANGLE) |
| RAM | 16 GB |
| OS | Arch Linux, kernel 7.3.5 |
| Browser | Chromium 133.0.6943.16 (Playwright 1.50.1 headless shell) |
| Resolution | 1280 × 720 viewport, devicePixelRatio 1 |
| Match | 180 s session, 2 s spawn interval (more enemies than the default 3 s), seed 11 |

## Method

[`e2e/profiling.perf.spec.ts`](../e2e/profiling.perf.spec.ts) drives the game with **real keyboard input** and the real-time clock (no manual clock):

- the ship sails in circles;
- it holds the front cannon;
- it fires a broadside every 2 s, on each side in turn.

Every 15 s the test reads `FrameStats`, kept by the session:

- the average FPS;
- the 95th percentile of the frame time over the last 600 frames;
- the peak number of entities (ships + projectiles + effects).

The run uses the `?e2e&profile` flag. It sets the player's `maxHealth` to 1 000 000 through the config override, so the scripted player survives the full 3 minutes. Enemies then keep spawning up to the cap of 12, which is a worst-case load. No rule or system code changes; only a config value does.

```bash
npm run perf:gpu   # GPU (reference result)
npm run perf       # CPU-only WebGL (SwiftShader), the worst case
```

## Results: one 3-minute match

### GPU (reference): target met

| Time (s) | Avg FPS | p95 frame (ms) | Enemies | Projectiles | Peak entities |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 2 | 59.8 | 16.9 | 1 | 3 | 7 |
| 18 | 60.0 | 16.9 | 7 | 6 | 21 |
| 35 | 60.0 | 16.9 | 12 | 5 | 28 |
| 51 | 60.0 | 16.9 | 11 | 4 | 31 |
| 67 | 60.0 | 16.9 | 12 | 4 | 31 |
| 84 | 60.0 | 16.9 | 12 | 7 | 31 |
| 100 | 60.0 | 16.9 | 11 | 5 | 31 |
| 116 | 60.0 | 16.9 | 8 | 3 | 31 |
| 132 | 60.0 | 16.9 | 9 | 1 | 31 |
| 149 | 60.0 | 16.9 | 11 | 2 | 31 |
| 165 | 60.0 | 16.9 | 12 | 1 | 31 |

- Minimum average: **59.8 FPS**.
- Worst p95: **16.9 ms**, which is one 60 Hz frame.
- Peak: **31 entities**.

The frame rate is locked to the 60 Hz display rate for the whole match.

### CPU-only WebGL (SwiftShader): worst case, below target

Headless Chromium falls back to software rendering when the GPU is not enabled. CI machines and VMs without a GPU look like this.

- Minimum: **36.1 FPS**; it settles between 38.9 and 39.7 FPS.
- Worst p95: **32.1 ms**.
- Peak: **32 entities**.

The simulation runs on fixed 1/60 s steps, so the rules (movement, damage, cooldowns, spawns, the timer) stay exact at this lower frame rate. Only the visual smoothness drops.

## Memory: 5 cycles of start → play 8 s → exit

| | Baseline | Cycle 1 | Cycle 2 | Cycle 3 | Cycle 4 | Cycle 5 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| JS heap after forced GC (MB), GPU | 2.23 | 6.62 | 6.91 | 7.08 | 7.07 | 7.15 |
| JS heap after forced GC (MB), CPU | 2.21 | 6.63 | 6.92 | 6.98 | 7.06 | 7.16 |
| Canvases left in the DOM | 0 | 0 | 0 | 0 | 0 | 0 |

- **First cycle (+4.4 MB):** this is a one-off cost:
  - the battle chunk (PixiJS) is loaded;
  - the three atlases are decoded and cached on purpose for later matches;
  - TanStack Query fills its cache.
- **Cycles 2–5:** the heap grows by about 0.1 MB per cycle and flattens. This is V8 and Pixi warm-up (JIT, shader and pool caches), not a leak. The test fails if growth across the cycles goes over 15 MB.
- **Released on every exit:**
  - each `Application` and canvas (0 canvases after each exit);
  - the listeners (keyboard, blur, visibility), the `ResizeObserver`, the ticker and the timers.

  The navigation E2E test (`09-navigation`) and the Strict Mode test (`strict-mode.dev.spec.ts`) check this too.

## What keeps the frame cheap

- React does not render per frame. The HUD store notifies only when a shown value changes (score, health, whole seconds, phase).
- **Sprites:**
  - projectile sprites come from a pool;
  - the cropped health-bar fill textures are cached per 2 % bucket and shared;
  - the atlases are loaded once and reused across matches.
- The water is one `TilingSprite`, and the islands are built once per match.
- The simulation works on plain objects. Collision checks run against at most 12 enemies and a few dozen projectiles, so a spatial index is not needed.

## Limitations observed

- The numbers come from one machine. A 60 Hz display caps the measured FPS at about 60, so the headroom above 60 is not measured.
- Headless runs have no compositor vsync jitter. A real browser window adds a little variance.
- The CPU-only result shows that machines without GPU acceleration run the game at about 39 FPS. The game stays fully playable and correct.
- `performance.memory` / CDP `JSHeapUsedSize` covers the JS heap only. GPU memory is checked indirectly: textures are kept on purpose, and `app.destroy` releases each match's GPU objects.
