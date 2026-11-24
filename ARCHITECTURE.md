# Architecture

```
src/
├── game/        Pure rules: config, simulation, systems (movement, combat, AI, spawner), arena, math, RNG
├── render/      PixiJS only: asset loading, renderer, ship views, health bars, effects
├── session/     One match: Pixi app + simulation + renderer + input + clock + lifecycle
├── api/         Contracts, Axios client, TanStack Query hooks, submission outbox
├── mocks/       MSW handlers, mock DB (localStorage), fixtures, network scenarios
├── storage/     Validated localStorage persistence (options, player, last result)
├── audio/       Web Audio wrapper (optional, never blocks)
└── ui/          React screens, components, hash router, styles
```

Dependencies only point downward: `ui → session → render → game`, and `ui → api → storage`. The `game/` folder imports nothing from React, Pixi or the DOM. That is why its unit tests run in plain Node.

## React and PixiJS integration

- **React** owns the menus, forms, dialogs, the HUD and the on-screen controls (DOM overlays).
- **PixiJS** owns the arena, ships, projectiles, effects and the health bars above each ship.
- `GameScreen` gives a host `<div>` to `useGameSession`, which calls `GameSession.create()`. That call creates a Pixi `Application` (`resizeTo: host`, `autoDensity`, resolution = `devicePixelRatio`, capped at 2), the `Simulation` and the `GameRenderer`.
- **Start failures.**
  - If the renderer cannot start (for example, no WebGL) or takes more than 20 s, the screen shows the reason with Retry and Main Menu. A failure after `init` destroys the half-built session, and a late session is destroyed when it resolves, so nothing leaks.
  - An error boundary wraps the lazy battle screen. If its chunk fails to download, the player sees a message and a **Reload Game** button instead of a blank page. A reload is needed because browsers cache a failed dynamic import.
- **Strict Mode safety.** `Application.init` is async, so the effect keeps a `disposed` flag. If React unmounts before init finishes, the new session is destroyed as soon as it resolves. Every listener, observer and ticker callback is removed in `GameSession.destroy()`. `destroy()` is idempotent.
- **React does not re-render every frame.** The session publishes a `HudState` to a small external store (`session/store.ts`). It only notifies when a shown value changes: score, health, whole seconds left, or phase. React reads it with `useSyncExternalStore`. Continuous combat state (positions, velocities, cooldowns) never leaves the simulation.
- **Accessibility.**
  - A hidden status list (score, time, health, phase) exposes the battle state to assistive technology.
  - A polite live region announces only meaningful events: score, low health, the 30 s and 10 s warnings, pause and end.
  - The canvas is `aria-hidden`.

## Simulation loop

- `Simulation.step(dt, input)` holds all the rules. It is deterministic: a seed plus an input sequence reproduces a match, and unit tests check this.
- `FixedStepClock` turns real frame time into **fixed 1/60 s steps**. Movement, damage, cooldowns and spawns therefore do not depend on the frame rate (a unit test compares 30 Hz with 120 Hz). Long frames are capped at 250 ms, which avoids a "spiral of death".
- The order within a step:
  1. player steering, movement and weapons;
  2. spawner;
  3. enemy AI and movement;
  4. projectiles and hits;
  5. Chaser rams;
  6. ship separation;
  7. removal of dead entities;
  8. end check.
- **Pause.** The ticker stops and keyboard input is detached, which clears held keys. The clock accumulator is reset, and `lastFrameTime` is reset on resume. So the paused time is thrown away, no cooldown or spawn timer moves, and no movement or shot carries over. Resuming needs an explicit action (the Resume button or `Esc`). The dialog stops the `Esc` event, so the game's re-attached key listener does not see it and pause again.
- **End.** The status becomes `ended`, the end reason is recorded, and `step()` turns into a no-op. Movement, attacks, damage, spawns and scoring all stop. The renderer keeps playing the final explosions on a frozen world.
- **Test clock.** With `?clock=manual` the ticker still renders, but only `advance(ms)` steps the simulation. E2E tests use this to control time exactly while sending real key and pointer events.

## Movement, AI and collisions

- Ships have a heading and a scalar speed along it. Thrust accelerates, and drag slows them when no thrust is applied. Rotation uses `turnSpeed`.
- **Shapes.** Ships are circles. Islands are axis-aligned rectangles inset 14 px from the drawn shoreline. Projectiles are small circles.
- **Ship vs island or arena edge.** The ship is pushed out along the minimum translation (`resolveCircleRect`) and clamped to the arena. A blocked ship loses 40 % of its speed so it does not grind along the shore.
- **Ship vs ship.** Overlapping ships are separated (equal mass), and the shore is then re-resolved so a push cannot shove a ship into an island.
- **Projectiles.**
  - A projectile hits at most one ship: it is marked dead on first contact and removed in the same step, so damage is applied once.
  - It also ends on island contact, on leaving the arena, or when it has travelled its `range`.
  - Each weapon (front, left, right, enemy) has its own cooldown.
- **Chaser.** It steers towards the player. Look-ahead probes turn it around islands. On contact it deals `contactDamage`, explodes and never scores.
- **Shooter.** It approaches until `preferredDistance` and keeps its bow aimed at the player. It fires its front cannon when the player is inside `attackRange`, within `aimTolerance`, and in line of sight (Liang–Barsky segment test against the islands).
- **Spawner.**
  - The first spawn comes after `initialDelay`, then one every `spawnIntervalSeconds`.
  - The first two spawns are one Chaser and one Shooter, so both types always appear. After that, `chaserWeight` decides.
  - A spawn point is sampled with the seeded RNG. It must be away from the player (`minDistanceFromPlayer`), clear of islands and other ships, and inside the edge margin.
  - If no valid point is found, the spawner retries 0.25 s later. Spawning stops at `maxEnemies`.

## Rendering and resources

- **Atlases.** Three atlases are loaded once with Pixi `Assets`, with a progress callback: the UI atlas, the ships atlas (converted from Sparrow XML) and the tiles atlas (generated). Critical frames are checked before combat starts.
- **Load failures.** A failure shows an error with a Retry button. Pixi evicts failed URLs from its cache, so Retry re-downloads them. Textures are cached by Pixi and reused across matches. `app.destroy` is called with `texture: false` so the shared atlases survive.
- **Static world.** Water is a `TilingSprite`. Islands are sprites built from tile frames once per match.
- **Entities.**
  - Ship views are created and destroyed to match the simulation's entities.
  - Projectile sprites come from a pool.
  - Damage stages switch the hull frame (intact, damaged, heavily damaged, wreck) and add flickering fire at heavy damage.
- **Health bars.** They follow the atlas `ui.layout` metadata: frame first, then fill clipped on the x axis from the left. The clipped fill textures are cached per 2 % bucket and shared.
- **Effects.** Muzzle flash, impact, explosion, splash and sinking wreck. They advance with simulated time, so they freeze during a pause.
- **Viewport.** The logical arena is 1536×896. `fitArena` letterboxes it into the canvas while keeping the aspect ratio. A `ResizeObserver` resizes the renderer and recomputes the scale and offset. Pointer input uses DOM buttons, so no canvas coordinate mapping is needed. The arena bounds are logical, so resizing never changes the rules.

## Persistence

All `localStorage` access goes through validators in `storage/` and falls back to memory when storage is unavailable. Options must be inside the limits and on a step (for example 1.3 s is rejected). The outbox keeps every valid record even when one stored entry is corrupt.

| Key | Content |
| --- | --- |
| `pirate-battle:options:v1` | Session time, spawn interval, sound (saved only when valid) |
| `pirate-battle:player:v1` | Player id (UUID) and captain name |
| `pirate-battle:last-result:v1` | Last completed match, used by the result screen after a refresh |
| `pirate-battle:pending-matches:v1` | Outbox of records not yet confirmed |
| `pirate-battle:mock-db:v1` | MSW "server" data |
| `pirate-battle:mock-scenario:v1` | Selected network scenario |

A refresh, or leaving the play route, destroys the session. Booting on `#/play` redirects to the menu. An abandoned match never creates a record.

## Ranking and match history

### Contracts

The contracts live in `api/contracts.ts` and are shared by the client and MSW. Every response uses the envelope `{ success, data, error }`.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/ranking?sessionSeconds&spawnIntervalSeconds&page&pageSize` | `Page<RankingEntry>` for that configuration only |
| `GET /api/players/:playerId/matches?page&pageSize` | `Page<MatchRecord>`, newest first |
| `POST /api/matches` | Idempotent by `matchId`: `201 {created:true}` or `200 {created:false}` with the stored record |

A `MatchRecord` holds:

- `matchId` and `playerId`/`playerName`;
- `playedAt`, `score` and `durationMs` (active time);
- `endReason`;
- `config` (`sessionSeconds`, `spawnIntervalSeconds`).

### Ranking rules

The ranking only compares matches played with the same configuration. Ties are broken deterministically in this order: score (desc), duration (asc), `playedAt` (asc), then `matchId` (asc). The ranking and the history come from the same mock DB rows, so the two tabs always agree.

### Client

- Axios has a 4 s timeout, and errors are normalised to `ApiError`. A 4xx error (except 408 and 429), a malformed body and a `success: false` envelope are permanent. Timeouts, network errors and 5xx are retried.
- TanStack Query:
  - **Queries.** Keys look like `['ranking', session, spawn, page]` and `['history', playerId, page]`. They retry twice with exponential backoff. `placeholderData: keepPreviousData` keeps the previous page visible while the next one loads. `refetchOnMount: 'always'` refreshes a tab each time it is shown, and an "Updating…" hint shows the background refresh.
  - **Out-of-order responses.** Each page has its own cache entry, and Axios receives the query `signal`. A superseded fetch for the same key is cancelled. So a late response cannot overwrite newer data.
  - **Mutation.** `submit-match` uses the same retry policy. On success it invalidates both the ranking and the history.

### Submission outbox

`MatchSyncProvider` and `PendingMatchStore` handle submissions.

1. When a match completes, the record (with a client-generated `matchId`) is first written to the persisted outbox, then submitted.
2. It leaves the outbox only after the server confirms it, or refuses it for good (4xx, or a `success: false` envelope). A refused record is shown as "could not be recorded" instead of being replayed forever.
3. Pending records are sent again at start-up, on the `online` event, and when the player presses Retry.
4. An in-memory in-flight set drops duplicate sends from repeated clicks. Because the server deduplicates by `matchId`, a retry after a timeout returns the stored record. The `submit-timeout-after-save` scenario covers this case.
5. Submission is fire-and-forget from the game's point of view. API failures never block playing, the options or combat, and the player can start another match while a record is pending.

### Mocks (MSW)

- MSW starts before React renders, in every build, through `public/mockServiceWorker.js`. If the worker cannot start, the game still works and the log tabs show their error state.
- Scenarios are stored in `localStorage` and read on each request.
- Latency is deterministic: fixed per scenario, or seeded by the request counter in `variable-latency`.
- Fixtures are deterministic rival records for three configurations.

## Testing

- **Vitest** (86 tests, about 94 % statement coverage of the non-visual code, enforced at 80 %). Covers:
  - the simulation rules: movement, frame-rate independence, bounds, islands, weapons, cooldowns, single damage, scoring, Chaser and Shooter, spawns, determinism, both end conditions;
  - geometry, RNG, fixed-step clock, HUD store and keyboard input;
  - config and storage validation;
  - the API against MSW: pagination, ties, idempotency, error mapping, timeouts, out-of-order responses, envelopes and the outbox.
- **Playwright.** The 12 required flows, plus resizing (`14-responsive`), run against `vite preview`, on desktop Chromium (1280×720) and Pixel 7 landscape (touch).
  - The `strict-mode-dev` project runs one spec against the Vite dev server. That is the only place React Strict Mode double-mounts effects. It checks that exactly one session (one canvas) exists and that it is released on exit.
  - Profiling (`*.perf.spec.ts`) runs only through `npm run perf` / `npm run perf:gpu`. See [reports/PERFORMANCE.md](reports/PERFORMANCE.md).
  - Every test starts from a fresh browser context, so storage and the service worker are isolated.
  - Tests seed the RNG, use the manual clock and fail on unexpected console errors.
  - Visual baselines (menu, stable arena, result) are versioned under `e2e/__screenshots__/`.

## Balancing decisions and limitations

- **Player.** 100 HP. The front cannon deals 25 every 0.35 s with a 520 px range. A broadside fires 3 × 20 every 1.2 s with a 380 px range. The player sails faster than both enemies (170 px/s), so kiting works.
- **Chaser.** 40 HP, so two front shots kill it. It rams for 20 and outpaces Shooters.
- **Shooter.** 70 HP. It hits for 10 every 1.8 s and stays about 260 px away.
- **Tuning.** With the default 3 s spawn interval, standing still sinks the player in about 20–30 s, and active play survives the full 2 minutes.
- **Limitations.**
  - Enemy obstacle avoidance uses probes, not path finding (fine for the sparse, convex islands).
  - Collision shapes are approximate (circles and inset rectangles).
  - The arena is a single fixed layout.
  - The retina atlases are not used, because many "retina" PNGs are the same size as the default ones. Pixi renders at `devicePixelRatio` instead.
  - Audio needs a user gesture (browser policy). It starts on the first Play.
