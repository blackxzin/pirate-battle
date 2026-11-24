# Requirements checklist

Each requirement of the [challenge brief](https://github.com/junglegaming/game-developer-challenge) is mapped below to where it is implemented and how it is verified.

- **Unit** = Vitest (`src/**/*.test.ts`).
- **E2E** = Playwright (`e2e/*.spec.ts`), run on desktop and mobile Chromium.

## 1. Mandatory stack

| Requirement | Where |
| --- | --- |
| React for UI and menus | `src/ui/` |
| TypeScript strict | `tsconfig.json` (`strict`, `noUncheckedIndexedAccess`); `npm run typecheck` |
| PixiJS renders the game | `src/render/`, `src/session/gameSession.ts` |
| TanStack Query for ranking and history | `src/api/queries.ts`, `src/api/MatchSyncProvider.tsx` |
| Axios as HTTP client | `src/api/http.ts`, `src/api/matchesApi.ts` |
| MSW mocks the APIs | `src/mocks/` (browser worker in every build, `msw/node` in unit tests) |
| Playwright for E2E and visual regression | `e2e/`, `playwright.config.ts` |

## 2. Gameplay

| Requirement | Implementation | Verified by |
| --- | --- | --- |
| Forward movement; rotation both ways | `systems/movement.ts` | Unit `player movement`; E2E `03-movement` |
| Front shot: 1 projectile | `systems/combat.ts` `fireFront` | Unit `weapons`; E2E `04-combat` |
| Broadside: 3 parallel projectiles, left and right | `fireBroadside` | Unit `weapons`; E2E `04-combat` |
| Limited health, reduced by enemy shots and by Chaser rams | `applyDamage`, `simulation.ts` | Unit `combat and scoring`, `enemies and the world`; E2E `05-enemies` |
| Stays inside the visible arena, cannot cross islands | `resolveStaticCollisions` | Unit; E2E `03-movement` |
| Keyboard and touch controls, move and fire at once, controls shown in the UI | `session/input.ts`, `TouchControls.tsx`, menu controls list | Unit `InputController`; E2E `03`, `04`, `09` (touch) |
| Chaser chases, rams, explodes | `systems/ai.ts` | Unit; E2E `05-enemies` |
| Shooter approaches, fires in range | `systems/ai.ts` | Unit; E2E `05-enemies` |
| Enemies move, rotate, take damage and respect islands | `ai.ts` (shore following), `movement.ts` | Unit `enemies never sail through islands`, `enemies sail round an island…` |
| Both enemy types appear in a default match | spawner: first spawns are a Chaser then a Shooter | Unit; E2E `05-enemies` |
| Spawns every interval until the end, at points clear of obstacles and far from the player | `systems/spawner.ts` | Unit `spawning`; E2E `05-enemies` |
| Water and islands that block ships and projectiles | `game/arena.ts` | Unit `stops projectiles at islands`, `cannot cross islands` |
| Projectile direction, speed, damage, range | `config.ts`, `combat.ts` | Unit `weapons` |
| Player shots hit enemies; enemy shots hit the player | factions in `updateProjectiles` | Unit `enemy projectiles damage the player once each` |
| One hit per projectile; removed on hit, island, range or leaving the arena | `updateProjectiles` | Unit `damages each target only once`, `removes projectiles…` |
| Each weapon has its own cooldown | `tickCooldowns` | Unit; E2E `04-combat` |
| A destroyed enemy stops dealing damage, firing and colliding | `removeDead` (also removes its shots in flight) | Unit `a destroyed enemy stops…`, `a sunk Shooter's cannonballs…` |
| Duration 60–180 s, 1 point per kill, Chaser self-destruct scores 0 | `config.ts`, `simulation.ts` | Unit; E2E `04`, `05` |
| Ends on time or death and freezes everything | `checkEnd`, `step` no-op | Unit; E2E `06-match-end` |
| Restart creates a clean match | new `GameSession` per match (`key`) | E2E `06` *Play Again starts a clean match* |
| Health above the player and each enemy; HUD shows score and time | `render/healthBar.ts`, `Hud.tsx` | E2E visual `arena` |
| Manual pause, auto-pause on blur, hidden tab, or a phone turned upright; time, cooldowns and simulation frozen; explicit resume; nothing accumulates | `GameSession.pause/resume` | E2E `07-pause` (4 tests), `14-responsive` |
| Firing, explosion and damage-stage effects | `render/effects.ts`, `shipView.ts` | Visual baselines; manual |

## 3. Screens and settings

| Requirement | Verified by |
| --- | --- |
| Menu: Play, Options, control instructions, Ranking and Match History | E2E `01`, `09`, visual `menu` |
| Options: session and spawn time, validated, saved, kept after refresh | E2E `01-options` |
| Result: score, time, end reason, registration status, Play Again and Main Menu | E2E `08-result`, visual `result` |
| Ranking: position, player, score, pagination | E2E `10-captains-log` |
| Match History: date, score, duration, end reason, pagination | E2E `10` *match history is paginated…* |
| Typed, central gameplay config; balancing needs no logic change | `src/game/config.ts` (frozen snapshot); Unit `config` |
| Spawn interval positive with documented limits (1–10 s, 0.5 s steps) | README; Unit `accepts only values inside the limits and on a step` |
| Each match uses a config snapshot; later changes apply to the next match | E2E `01` *changes made during a match apply only to the next match* |
| Refresh or leaving ends the match; options and last result persisted; abandoned matches never recorded | E2E `09-navigation`, `08-result` |
| UI, code and docs in English | all sources |

## 4. PixiJS and architecture

| Requirement | Where / verified by |
| --- | --- |
| Pixi for arena, ships, projectiles, effects and ship indicators; React for menus, forms, panels and dialogs | ARCHITECTURE.md *React and PixiJS integration* |
| Rules, rendering, input and UI state kept apart | `game/` (pure) · `render/` · `session/input.ts` · `ui/` |
| Time-based simulation, independent of frame rate | Unit `is frame-rate independent` (30 Hz vs 120 Hz) |
| UI synced without a React render per frame | `session/store.ts` (notifies on change only); Unit `Store` |
| Textures loaded once and reused; failures handled before combat | `render/assets.ts`; E2E `02-assets` |
| Canvas fits the screen and pixel density; aspect, input and bounds preserved | `fitArena`, `ResizeObserver`; E2E `14-responsive` |
| Listeners, ticker, timers, entities and resources released on exit or restart | `GameSession.destroy`; E2E `09`; memory profile |
| Correct start-up and teardown under React Strict Mode | E2E `strict-mode.dev.spec.ts` (dev server, where Strict Mode double-mounts) |

## 5. Ranking and history

| Requirement | Verified by |
| --- | --- |
| Typed contracts; ranking paginated by score; register and query history | `api/contracts.ts`; Unit `api.integration` |
| Record holds match id, player, date, score, active duration, end reason and config | `MatchRecord` |
| Ranking compares the same configuration only; deterministic tie-break | `compareRanking`; Unit *deterministic ties* |
| Fixtures for other players | `mocks/fixtures.ts` |
| Loading, empty, error, background refresh, cache, invalidation, retries | `QueryStatus.tsx`, `queries.ts`; E2E `10` |
| Both tabs refresh after a registration and when shown again | invalidation + `refetchOnMount: 'always'`; E2E `11` |
| A late response never overwrites newer data | per-page keys + abort signal; Unit and E2E `10` |
| One record per match; repeated sends and clicks deduplicated | idempotent POST by `matchId`; E2E `12` |
| Pending records survive failures and refresh; retry available; a new match can start meanwhile | outbox (`pendingMatches.ts`); E2E `11` |
| API failures never block the game, the options or combat | E2E `12` *API failures never block the game* |

## 6. MSW

| Requirement | Where |
| --- | --- |
| Mocks at the network layer; contracts, fixtures and handlers shared by dev, tests and the demo | `src/mocks/` |
| Success, empty and multi-page lists | `normal`, `empty` |
| Slow, variable latency, out-of-order responses | `slow`, `variable-latency`, `out-of-order` |
| Timeout, connection failure, HTTP 4xx and 5xx | `timeout`, `offline`, `bad-request`, `server-error` |
| Ranking or history failure | `ranking-error`, `history-error` |
| Timeout after a registration, recovered without a duplicate | `submit-timeout-after-save` |
| Unavailable at match end, registered after recovery | `submit-unavailable` |
| Scenario picker and reset | Options → Network lab; `?scenario=` |
| Deterministic randomness and latency in tests | seeded latency, `?seed=`, manual clock |
| Mocks run in the published build | `public/mockServiceWorker.js`, started in `main.tsx` |
| Confirmed and pending records persisted locally | `pirate-battle:mock-db:v1`, `pirate-battle:pending-matches:v1` |

## 7. Interface, assets and accessibility

| Requirement | Verified by |
| --- | --- |
| Provided assets used; conversions and licences documented | README *Assets and licences* |
| Desktop and mobile; touch controls; arena and HUD never clipped | E2E on `mobile-chromium`; `14-responsive` |
| Supported orientation: landscape on phones (rotate hint in portrait); layout adapts to resizing | CSS media queries; E2E `14-responsive` |
| Asset loading shows progress | E2E `02-assets` |
| Keyboard navigation, visible focus, dialog focus management, labels, accessible errors | E2E `01` (keyboard), `10` (tabs, `role=alert`), `Dialog.tsx` |
| Score, time and state in semantic markup, without per-frame announcements | `Hud.tsx` status list and live region |
| Game keys captured only during gameplay | Unit `InputController`; E2E `01` (typing in pause → Options) |

## 8. Playwright

| Required flow | Spec |
| --- | --- |
| 1. Options navigation, validation, persistence | `01-options` |
| 2. Asset loading, failure, retry | `02-assets` |
| 3. Start, movement, rotation, arena bounds, islands | `03-movement` |
| 4. Front and side fire, damage, cooldown, scoring without duplicates | `04-combat` |
| 5. Chaser, Shooter, spawn interval | `05-enemies` |
| 6. End by time and death, simulation stops, clean restart | `06-match-end` |
| 7. Pause, focus loss, resume without timer drift | `07-pause` |
| 8. Result shown and kept after refresh | `08-result` |
| 9. Abandoning, repeated navigation, touch controls | `09-navigation` |
| 10. Ranking and history queries, pagination, loading, empty, error | `10-captains-log` |
| 11. Registration, both tabs updated, pending record recovered after refresh | `11-records` |
| 12. Resend after timeout without duplicates; late responses ignored | `12-resilience`, `10-captains-log` |
| Desktop and mobile Chromium | projects `desktop-chromium`, `mobile-chromium` |
| Visual regression of the menu, a stable arena and the result screen, with versioned baselines | `13-visual`, `e2e/__screenshots__/` |
| Seeds and a controlled clock; real inputs, rules, collisions and rendering | `?seed`, `?clock=manual`; `e2e/support.ts` |
| Isolated state per test; HTML report and failure traces | fresh context per test; `reports/playwright/`; `trace: 'retain-on-failure'` |

## 9. Performance

| Requirement | Evidence |
| --- | --- |
| 60 FPS target in a documented environment; FPS, p95 and entity count over one 3-minute match | [reports/PERFORMANCE.md](reports/PERFORMANCE.md): desktop GPU, CPU-only WebGL, and mobile emulation (Pixel 7, CPU slowed down 4×) |
| Memory after 5 start/play/exit cycles | same report |

## 11. Delivery

| Requirement | Where |
| --- | --- |
| Source code, lockfile, assets, mocks, fixtures and tests | repository |
| Public deploy on Vercel, running the mocks | https://pirate-battle-ashy.vercel.app; `npm run test:e2e:live` runs the E2E suite against it |
| README: setup, environment variables, controls, gameplay config, scenarios, commands, reproducing failures | README.md |
| ARCHITECTURE.md with decisions, limitations and balancing | ARCHITECTURE.md |
| Test and profiling reports | [reports/](reports) |
| Runs from a clean checkout, with no private services | `npm ci && npm run build`; CI workflow |
