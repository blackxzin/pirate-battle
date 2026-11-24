import { HttpResponse, delay, http } from 'msw';
import {
  API_PATHS,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  isMatchConfigSummary,
  isMatchRecord,
  type ApiResponse,
} from '../api/contracts';
import { REQUEST_TIMEOUT_MS } from '../api/http';
import { createRng } from '../game/rng';
import { findMatch, insertMatch, queryHistory, queryRanking } from './db';
import { getScenario } from './scenarios';

type Endpoint = 'ranking' | 'history' | 'submit';

const BASE_LATENCY_MS = 120;
const SLOW_LATENCY_MS = 2500;
const NEVER_LATENCY_MS = REQUEST_TIMEOUT_MS + 2500;

let requestCounter = 0;
/** Matches whose first submit already "timed out" (submit-timeout-after-save). */
const delayedSubmits = new Set<string>();

export function resetMockNetworkState(): void {
  requestCounter = 0;
  delayedSubmits.clear();
}

function ok<T>(data: T, status = 200): Response {
  const body: ApiResponse<T> = { success: true, data, error: null };
  return HttpResponse.json(body, { status });
}

function fail(status: number, code: string, message: string): Response {
  const body: ApiResponse<never> = { success: false, data: null, error: { code, message } };
  return HttpResponse.json(body, { status });
}

/** Latency for the current scenario. Deterministic for a given request order. */
function latencyFor(requestNumber: number): number {
  switch (getScenario()) {
    case 'slow':
      return SLOW_LATENCY_MS;
    case 'variable-latency':
      return Math.round(createRng(requestNumber * 9973).range(100, 1500));
    case 'out-of-order':
      return requestNumber % 2 === 1 ? 1600 : 150;
    case 'timeout':
      return NEVER_LATENCY_MS;
    default:
      return BASE_LATENCY_MS;
  }
}

/** Returns an error response for the active scenario, or null to proceed. */
async function simulateNetwork(endpoint: Endpoint): Promise<Response | null> {
  requestCounter += 1;
  await delay(latencyFor(requestCounter));
  switch (getScenario()) {
    case 'offline':
      return HttpResponse.error();
    case 'server-error':
      return fail(500, 'INTERNAL', 'The harbour master is unavailable.');
    case 'bad-request':
      return fail(400, 'BAD_REQUEST', 'The request was rejected.');
    case 'ranking-error':
      return endpoint === 'ranking' ? fail(500, 'INTERNAL', 'Ranking is unavailable.') : null;
    case 'history-error':
      return endpoint === 'history' ? fail(503, 'UNAVAILABLE', 'History is unavailable.') : null;
    case 'submit-unavailable':
      return endpoint === 'submit' ? fail(503, 'UNAVAILABLE', 'Matches cannot be recorded right now.') : null;
    default:
      return null;
  }
}

function readPaging(url: URL): { page: number; pageSize: number } | null {
  const page = Number(url.searchParams.get('page') ?? '1');
  const pageSize = Number(url.searchParams.get('pageSize') ?? String(DEFAULT_PAGE_SIZE));
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    return null;
  }
  return { page, pageSize };
}

export const handlers = [
  http.get(`*${API_PATHS.ranking}`, async ({ request }) => {
    const failure = await simulateNetwork('ranking');
    if (failure) return failure;
    const url = new URL(request.url);
    const paging = readPaging(url);
    const config = {
      sessionSeconds: Number(url.searchParams.get('sessionSeconds')),
      spawnIntervalSeconds: Number(url.searchParams.get('spawnIntervalSeconds')),
    };
    if (!paging || !isMatchConfigSummary(config)) return fail(400, 'BAD_REQUEST', 'Invalid ranking query.');
    if (getScenario() === 'empty') return ok({ items: [], meta: { ...paging, totalItems: 0, totalPages: 1 } });
    return ok(queryRanking(config, paging.page, paging.pageSize));
  }),

  http.get(`*${API_PATHS.historyPattern}`, async ({ request, params }) => {
    const failure = await simulateNetwork('history');
    if (failure) return failure;
    const paging = readPaging(new URL(request.url));
    const playerId = typeof params.playerId === 'string' ? params.playerId : '';
    if (!paging || playerId.length === 0) return fail(400, 'BAD_REQUEST', 'Invalid history query.');
    if (getScenario() === 'empty') return ok({ items: [], meta: { ...paging, totalItems: 0, totalPages: 1 } });
    return ok(queryHistory(playerId, paging.page, paging.pageSize));
  }),

  http.post(`*${API_PATHS.matches}`, async ({ request }) => {
    const body: unknown = await request.json().catch(() => null);
    if (!isMatchRecord(body)) {
      await delay(BASE_LATENCY_MS);
      return fail(400, 'BAD_REQUEST', 'Invalid match record.');
    }
    if (getScenario() === 'submit-timeout-after-save' && !delayedSubmits.has(body.matchId)) {
      // The server commits the record, but the response never reaches the client in time.
      delayedSubmits.add(body.matchId);
      insertMatch(body);
      await delay(NEVER_LATENCY_MS);
      return ok({ record: findMatch(body.matchId) ?? body, created: true }, 201);
    }
    const failure = await simulateNetwork('submit');
    if (failure) return failure;
    const result = insertMatch(body);
    return ok(result, result.created ? 201 : 200);
  }),
];
