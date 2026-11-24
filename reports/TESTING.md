# Test report

Latest full run, on the machine described in [PERFORMANCE.md](PERFORMANCE.md).

| Check | Command | Result |
| --- | --- | --- |
| Lint | `npm run lint` | clean |
| Types (strict) | `npm run typecheck` | clean |
| Unit and integration | `npm run test:coverage` | **86 passed** in 6 files |
| End-to-end | `npm run test:e2e` | **95 passed** (2.1 min) |

`npm run test:all` runs all four in that order.

## Unit and integration tests (Vitest)

| File | Covers |
| --- | --- |
| `src/game/simulation.test.ts` | movement, weapons, cooldowns, damage, scoring, AI, spawning, islands, match end, frame-rate independence, config limits |
| `src/game/math.test.ts` | angles, shapes, circle/rectangle collision, segment clipping, seeded RNG |
| `src/session/session.test.ts` | fixed-step clock, frame stats, HUD store, keyboard input (including modifier keys) |
| `src/api/api.integration.test.ts` | Axios client against MSW (`msw/node`): envelopes, pagination, ranking order and ties, idempotent POST, every failure scenario, the pending-match outbox |
| `src/storage/preferences.test.ts` | options, captain profile, last result, storage failures |
| `src/ui/format.test.ts` | formatting, routes, retry policy, query keys |

### Coverage

The HTML report is in [`coverage/index.html`](coverage/index.html). It covers the rules, API, mocks, storage and session logic (see `vitest.config.ts`). Rendering and React screens are covered by the E2E suite instead.

| Statements | Branches | Functions | Lines |
| ---: | ---: | ---: | ---: |
| 93.96 % | 90.19 % | 92.57 % | 93.96 % |

The build fails below 80 % on any of them.

## End-to-end tests (Playwright)

Run against the production build (`vite build` + `vite preview`), with MSW running in the browser as in the deployed demo.

| Project | Device | Tests |
| --- | --- | ---: |
| `desktop-chromium` | 1280 × 720 | 47 |
| `mobile-chromium` | Pixel 7, landscape, touch | 47 |
| `strict-mode-dev` | dev server, where React Strict Mode double-mounts | 1 |

| Spec | Tests | Flow from the brief |
| --- | ---: | --- |
| `01-options` | 4 | options navigation, validation, persistence; changes apply to the next match |
| `02-assets` | 3 | loading progress, failure, retry; battle chunk failure |
| `03-movement` | 4 | start, movement, rotation, arena bounds, islands |
| `04-combat` | 3 | front and side fire, damage, cooldown, scoring without duplicates |
| `05-enemies` | 3 | Chaser, Shooter, spawn interval |
| `06-match-end` | 3 | end by time and by death, frozen simulation, clean restart |
| `07-pause` | 4 | manual pause, Escape, focus loss, hidden tab, no timer drift |
| `08-result` | 1 | result shown and kept after refresh |
| `09-navigation` | 4 | abandoning, repeated navigation, touch controls, resource release |
| `10-captains-log` | 9 | ranking and history, pagination, loading, empty, error, timeout, late responses |
| `11-records` | 2 | registration updates both tabs; pending record recovered after refresh |
| `12-resilience` | 3 | resend after timeout without duplicates; API failures never block play |
| `13-visual` | 3 | visual regression: menu, arena, result |
| `14-responsive` | 1 | resizing during a match keeps rules, HUD and input |
| `strict-mode.dev` | 1 | one session per match under Strict Mode, released on exit |

`profiling.perf.spec.ts` is excluded from the normal run. `npm run perf` and `npm run perf:gpu` run it; see [PERFORMANCE.md](PERFORMANCE.md).

### Determinism

- `?seed=` fixes the match RNG and the mock latency.
- `?clock=manual` lets a test advance the simulation by an exact number of milliseconds. Inputs, rules, collisions and rendering stay real.
- Each test gets a fresh browser context, so storage and the mock database start empty.
- A console guard fails any test that logs an unexpected console error or throws an uncaught page error.

### Visual baselines

Versioned in `e2e/__screenshots__/<project>/13-visual.spec.ts/` (menu, arena, result, for each project). To update them after an intended UI change:

```bash
npx playwright test e2e/13-visual.spec.ts --update-snapshots
```

### Reports and traces

- HTML report of the latest run: [`playwright/index.html`](playwright/index.html), or `npx playwright show-report reports/playwright`.
- On failure, the trace, screenshot and video are kept in `test-results/`. Open a trace with `npx playwright show-trace test-results/<test>/trace.zip`.

### Stability notes

Under heavy local load (four workers, two web servers and other processes), two earlier full runs each had one timeout: `browserContext.newPage` in `14-responsive`, and one `07-pause` test. Both passed when repeated in isolation: 10 of 10 and 30 of 30 runs. The latest full run passed 95 of 95. With `CI` set, Playwright uses two workers and one retry, and the HTML report marks any test that passes only on retry as flaky.
