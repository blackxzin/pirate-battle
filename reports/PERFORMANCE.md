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
npm run perf:mobile  # Pixel 7 emulation on the GPU, CPU slowed down 4x
```

## Results: one 3-minute match

The GPU and mobile runs were repeated after the enemy steering change (commit `169a527`). The CPU-only (SwiftShader) run is from the build before it; that change only adds a few segment tests per enemy per step.

### GPU (reference): target met

| Time (s) | Avg FPS | p95 frame (ms) | Enemies | Projectiles | Peak entities |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 2 | 59.4 | 16.9 | 1 | 3 | 7 |
| 18 | 59.9 | 16.8 | 5 | 1 | 18 |
| 35 | 60.0 | 16.8 | 9 | 3 | 24 |
| 51 | 60.0 | 16.8 | 11 | 5 | 28 |
| 67 | 60.0 | 16.8 | 12 | 5 | 29 |
| 84 | 60.0 | 16.8 | 12 | 8 | 31 |
| 100 | 60.0 | 16.8 | 12 | 11 | 34 |
| 116 | 60.0 | 16.8 | 12 | 7 | 34 |
| 132 | 60.0 | 16.9 | 12 | 8 | 34 |
| 149 | 60.0 | 16.9 | 12 | 10 | 34 |
| 165 | 60.0 | 16.9 | 12 | 6 | 34 |

- Minimum average: **59.4 FPS**, in the first sample, which includes start-up. Every later sample is 59.9 or 60.0.
- Worst p95: **16.9 ms**, which is one 60 Hz frame.
- Peak: **34 entities**, with the 12-enemy cap reached from 67 s on.

The frame rate is locked to the 60 Hz display rate for the whole match.

### Mobile emulation (GPU, CPU slowed down 4×): target met

`npm run perf:mobile` runs the same profile in the `mobile-chromium` project:

- Pixel 7 in landscape: 863 × 360 viewport, devicePixelRatio 2.625, touch, Android user agent;
- the game caps the render resolution at 2× (`gameSession.ts`), so the canvas draws up to about 1726 × 720 pixels;
- the CPU is slowed down 4× through the DevTools protocol (`Emulation.setCPUThrottlingRate`), a common approximation of a mid-range phone.

| Time (s) | Avg FPS | p95 frame (ms) | Enemies | Projectiles | Peak entities |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 2 | 54.4 | 17.6 | 1 | 2 | 10 |
| 19 | 59.3 | 17.5 | 6 | 1 | 18 |
| 35 | 59.6 | 17.4 | 11 | 4 | 26 |
| 68 | 59.8 | 17.4 | 10 | 3 | 31 |
| 102 | 59.9 | 17.4 | 12 | 4 | 33 |
| 135 | 59.9 | 17.4 | 11 | 2 | 33 |
| 168 | 59.9 | 17.4 | 11 | 3 | 34 |

The table shows 7 of the 11 samples; all of them are in `perf/combat-profile-gpu-mobile-cpu4x.json`.

- Only the first sample, which includes start-up, is below 59.3 FPS.
- Worst p95: **17.6 ms**.
- Peak: **34 entities**.

The GPU is still the desktop one, so this measures the CPU and pixel-density cost, not a phone GPU.

### CPU-only WebGL (SwiftShader): worst case, below target

Headless Chromium falls back to software rendering when the GPU is not enabled. CI machines and VMs without a GPU look like this.

- Minimum: **36.1 FPS**; it settles between 38.9 and 39.7 FPS.
- Worst p95: **32.1 ms**.
- Peak: **32 entities**.

The simulation runs on fixed 1/60 s steps, so the rules (movement, damage, cooldowns, spawns, the timer) stay exact at this lower frame rate. Only the visual smoothness drops.

## Memory: 5 cycles of start → play 8 s → exit

| | Baseline | Cycle 1 | Cycle 2 | Cycle 3 | Cycle 4 | Cycle 5 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| JS heap after forced GC (MB), GPU | 2.21 | 6.63 | 6.91 | 7.10 | 7.21 | 7.29 |
| JS heap after forced GC (MB), CPU | 2.21 | 6.63 | 6.92 | 6.98 | 7.06 | 7.16 |
| JS heap after forced GC (MB), mobile emulation | 2.25 | 6.69 | 6.98 | 7.17 | 7.25 | 7.35 |
| Canvases left in the DOM | 0 | 0 | 0 | 0 | 0 | 0 |

- **First cycle (+4.4 MB):** this is a one-off cost:
  - the battle chunk (PixiJS) is loaded;
  - the three atlases are decoded and cached on purpose for later matches;
  - TanStack Query fills its cache.
- **Cycles 2–5:** the heap grows by 0.3 MB or less per cycle, and less each time. This is V8 and Pixi warm-up (JIT, shader and pool caches), not a leak. The test fails if growth across the cycles goes over 15 MB.
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
