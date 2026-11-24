import { STORAGE_KEYS, getStorage } from '../storage/localStore';

export const SCENARIOS = [
  { id: 'normal', label: 'Normal', description: 'Fast, successful responses with fixture rivals.' },
  { id: 'empty', label: 'Empty lists', description: 'Ranking and history return no rows.' },
  { id: 'slow', label: 'Slow network', description: 'Every response takes about 2.5 s.' },
  { id: 'variable-latency', label: 'Variable latency', description: 'Seeded latency between 100 ms and 1.5 s.' },
  { id: 'out-of-order', label: 'Out-of-order responses', description: 'Odd requests are slow, even requests fast.' },
  { id: 'timeout', label: 'Timeout', description: 'Requests never answer before the client timeout.' },
  { id: 'offline', label: 'Connection failure', description: 'Network error on every request.' },
  { id: 'server-error', label: 'HTTP 500', description: 'Every endpoint answers 500.' },
  { id: 'bad-request', label: 'HTTP 400', description: 'Every endpoint answers 400 (not retried).' },
  { id: 'ranking-error', label: 'Ranking fails', description: 'Only the ranking endpoint fails (500).' },
  { id: 'history-error', label: 'History fails', description: 'Only the history endpoint fails (503).' },
  {
    id: 'submit-timeout-after-save',
    label: 'Submit timeout after save',
    description: 'The first submit of a match is stored but times out; retries recover it without duplicates.',
  },
  {
    id: 'submit-unavailable',
    label: 'Submit unavailable',
    description: 'Submitting a match answers 503 until another scenario is selected.',
  },
] as const;

export type ScenarioId = (typeof SCENARIOS)[number]['id'];

export const DEFAULT_SCENARIO: ScenarioId = 'normal';

export function isScenarioId(value: unknown): value is ScenarioId {
  return typeof value === 'string' && SCENARIOS.some((scenario) => scenario.id === value);
}

export function getScenario(): ScenarioId {
  const stored = getStorage().getItem(STORAGE_KEYS.mockScenario);
  return isScenarioId(stored) ? stored : DEFAULT_SCENARIO;
}

export function setScenario(id: ScenarioId): void {
  getStorage().setItem(STORAGE_KEYS.mockScenario, id);
}

/** Applies `?scenario=<id>` from the URL (handy for demos and tests). */
export function applyScenarioFromUrl(search: string): void {
  const requested = new URLSearchParams(search).get('scenario');
  if (isScenarioId(requested)) setScenario(requested);
}
