# Pirate Battle

A top-down 2D naval shooter built with **React**, **TypeScript (strict)** and **PixiJS**. Sail between islands, sink Chasers and Shooters, and climb the Captain's Log ranking.

The ranking and match history use REST APIs that are mocked with **MSW**. The client calls them through **Axios** and **TanStack Query**. The mocks also run in the deployed build.

- Live demo: _URL added after the first Vercel deploy (see [Deployment](#deployment))_
- Architecture and decisions: [ARCHITECTURE.md](ARCHITECTURE.md)
- Requirement-by-requirement checklist: [REQUIREMENTS.md](REQUIREMENTS.md)
- Test and profiling reports: [`reports/`](reports) ([test report](reports/TESTING.md), [performance](reports/PERFORMANCE.md))

## Setup

Requirements: Node.js 20+ (tested with Node 22 in CI and Node 26 locally) and npm.

```bash
npm install
npx playwright install chromium   # only needed for the E2E tests
npm run dev                       # http://localhost:5173
```

### Environment variables

None are required. The game runs fully in the browser and the backend is MSW. There are no secrets.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check, then production build into `dist/` |
| `npm run preview` | Serves `dist/` at http://localhost:4173 |
| `npm run lint` | ESLint (TypeScript and React Hooks rules) |
| `npm run typecheck` | `tsc --noEmit` in strict mode |
| `npm test` | Vitest unit and integration tests (rules, API, mocks, outbox, input, storage) |
| `npm run test:coverage` | Same tests with V8 coverage (fails under 80 %; HTML in `reports/coverage/`) |
| `npm run test:e2e` | Playwright E2E tests on desktop and mobile Chromium, against the production build |
| `npm run test:e2e:update` | Re-records the visual-regression baselines |
| `npm run perf` | Combat and memory profiling with CPU (SwiftShader) WebGL, the worst case (writes `reports/perf/*-software.json`) |
| `npm run perf:gpu` | Same profiling on the machine's GPU (writes `reports/perf/*-gpu.json`) |
| `npm run perf:mobile` | Same profiling in Pixel 7 emulation on the GPU, with the CPU slowed down 4× (writes `reports/perf/*-gpu-mobile-cpu4x.json`) |
| `npm run assets -- <path>` | Rebuilds `public/assets` from the challenge asset pack |
| `npm run test:all` | Runs lint, typecheck, unit tests with coverage, and E2E |

The Playwright HTML report is written to `reports/playwright/` (open it with `npx playwright show-report reports/playwright`). Failure traces, videos and screenshots go to `test-results/`; a failed test's trace opens with `npx playwright show-trace test-results/<test>/trace.zip`.

`npm run test:e2e` also runs one spec against the dev server (`strict-mode-dev` project), because React Strict Mode double-mounts effects only in development.

## Deployment

The game is a static site, and its API is mocked by MSW in the browser (also in production), so it needs no server or environment variables.

- **Vercel** (used for the live demo): import the repository, or run `npx vercel --prod`. [`vercel.json`](vercel.json) sets the build command (`npm run build`), the output directory (`dist`) and `no-cache` headers for `index.html` and the MSW service worker, so a new deploy is picked up on reload.
- **Netlify or Cloudflare Pages**: build command `npm run build`, output directory `dist`.
- Asset and API URLs follow Vite's `base`, so a sub-path deploy also works: `npm run build -- --base=/my/path/`.

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs lint, typecheck, the unit tests with coverage and the build on every push.

## Controls

| Action | Keyboard | Touch / mouse |
| --- | --- | --- |
| Sail forward | `W` / `↑` | ⬆ button (bottom left) |
| Turn left / right | `A` `D` / `←` `→` | ↶ ↷ buttons |
| Front cannon (1 ball) | `Space` | top-right button |
| Left / right broadside (3 balls) | `Q` / `E` | bottom-right buttons |
| Pause | `P` / `Esc` | ⏸ button |

You can move and fire at the same time, on the keyboard and with multi-touch. Game keys are only captured while a battle is running and not paused, and key presses with Ctrl, Alt or Meta are left to the browser. The game also pauses by itself when the window loses focus or the tab is hidden. To resume you must press **Resume** (or `Esc`).

On mobile the game supports **landscape**. In portrait, a hint asks you to rotate the device. Menus work in both orientations.

## Gameplay configuration

All balancing values live in one typed, frozen config: [`src/game/config.ts`](src/game/config.ts). It covers:

- session time and spawn interval;
- spawn distribution, distance, clearance and cap;
- health, speed, acceleration and turn rate per ship type;
- damage, range, projectile speed and cooldown per weapon;
- the Shooter's attack and preferred distance.

Each match takes a snapshot of this config when it starts. Changes made in Options during a pause apply to the next match.

The Options screen exposes two values:

| Option | Limits | Step | Default |
| --- | --- | --- | --- |
| Game session time | 60 to 180 s | 10 s | 120 s |
| Enemy spawn time | 1 to 10 s | 0.5 s | 3 s |

The Options screen also has the captain name and a sound toggle. All options are validated and saved to `localStorage` only when valid.

## Mock API scenarios (network lab)

Open **Options → Network lab** to pick a scenario. **Reset mock data** restores fixtures, clears pending records and goes back to `normal`. You can also add `?scenario=<id>` to the URL.

| id | Behaviour |
| --- | --- |
| `normal` | ~120 ms, success, fixture rivals with several pages |
| `empty` | Ranking and history are empty |
| `slow` | 2.5 s latency |
| `variable-latency` | Seeded latency from 100 ms to 1.5 s |
| `out-of-order` | Odd requests take 1.6 s, even ones 150 ms |
| `timeout` | Never answers before the 4 s client timeout |
| `offline` | Connection failure |
| `server-error` / `bad-request` | HTTP 500 / 400 on every endpoint |
| `ranking-error` / `history-error` | Only that endpoint fails |
| `submit-timeout-after-save` | The server stores the match, but the response times out. The retry recovers the stored record without a duplicate. |
| `submit-unavailable` | `POST /api/matches` answers 503 until you change scenario |

### Reproducing failures

1. Open `/?scenario=submit-unavailable` and finish a match. The result screen shows **Not recorded yet**.
2. Refresh the page. The record stays pending, and the menu and Captain's Log say how many are waiting.
3. Switch to `normal` in the Network lab, or open `/?scenario=normal`. Pending records are sent again on start-up, when the browser comes back online, or when you press **Retry now**.

For timeouts, use `/?scenario=submit-timeout-after-save`. The history ends with exactly one row.

## Test instrumentation

E2E tests add a few query flags (see [`src/runtimeFlags.ts`](src/runtimeFlags.ts)):

- `?e2e`: exposes `window.__PIRATE_BATTLE__` (`snapshot`, `advance`, `spawnEnemy`, `perf`);
- `?clock=manual`: the simulation only advances when the test calls `advance(ms)`;
- `?seed=<n>`: deterministic spawns.

Inputs still go through real keyboard and pointer events. The real rules, collisions and rendering always run.

## Assets and licences

### Game assets

All art and sounds come from the asset pack of the [Jungle Gaming game developer challenge](https://github.com/junglegaming/game-developer-challenge) (`assets/`). No other art, sound or font was added.

| Assets | Source | Licence |
| --- | --- | --- |
| Ships, ship parts, cannonballs, effects, tiles (`ships_miscellaneous_sheet`, `tiles_sheet`) | The format and art match [Kenney's Pirate Pack](https://kenney.nl/assets/pirate-pack) (2017). | Kenney's packs are [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (public domain). |
| UI atlas (`ui_sheet`), scene background, Jungle Gaming logo, sounds | Supplied with the challenge | No licence file is included; they are used only for this challenge, under the terms of the challenge repository. |

The challenge pack ships no licence file of its own, so the attribution above is the best available information.

[`scripts/prepare-assets.mjs`](scripts/prepare-assets.mjs) builds `public/assets` from that pack (`npm run assets -- <path-to-challenge>/assets`; `ffmpeg` is required for the audio step). It:

| Source (challenge pack) | Output (`public/assets`) | Change |
| --- | --- | --- |
| `spritesheet/ui_sheet.json/png`, `png/default/ui/**` | `ui_sheet.json/png`, `ui/**` | copied |
| `spritesheet/ships_miscellaneous_sheet.xml/png` (Sparrow) | `ships_sheet.json/png` | converted to a Pixi JSON atlas |
| `tilesheet/tiles_sheet.png` (64×64 tiles) | `tiles_sheet.json/png` | JSON atlas generated (`tile_N` frames) |
| `sounds/*.wav` | `sounds/*.mp3` | transcoded to MP3 (5.8 MB → ~1 MB) |
| `ui_scene_background.png`, `logo_jungle_gaming.svg` | same names | copied |

The output is committed, so a clean checkout runs without the pack. The UI uses system fonts, so no font files are shipped.

### Libraries

| Library | Licence |
| --- | --- |
| React, React DOM | MIT |
| PixiJS | MIT |
| TanStack Query | MIT |
| Axios | MIT |
| MSW (Mock Service Worker) | MIT |
| Vite, Vitest, TypeScript, ESLint | MIT / Apache-2.0 (TypeScript) |
| Playwright | Apache-2.0 |
