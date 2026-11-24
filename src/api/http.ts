import axios, { AxiosError, type AxiosInstance } from 'axios';
import type { ApiResponse } from './contracts';

export const REQUEST_TIMEOUT_MS = 4000;

/** `rejected`: a 2xx response whose envelope reports `success: false` (a business rule, not retried). */
export type ApiErrorKind = 'timeout' | 'network' | 'http' | 'invalid_response' | 'cancelled' | 'rejected';

/** Normalised API error with a user-facing message and retry hint. */
export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** 4xx (except 408/429) are permanent; everything else may succeed later. */
  get retryable(): boolean {
    if (this.kind === 'cancelled' || this.kind === 'invalid_response' || this.kind === 'rejected') return false;
    if (this.kind === 'http' && this.status !== null) {
      return this.status >= 500 || this.status === 408 || this.status === 429;
    }
    return true;
  }
}

export function createHttpClient(baseURL: string = import.meta.env.BASE_URL): AxiosInstance {
  return axios.create({ baseURL, timeout: REQUEST_TIMEOUT_MS, headers: { Accept: 'application/json' } });
}

export const httpClient = createHttpClient();

function messageFromBody(data: unknown): string | null {
  if (typeof data === 'object' && data !== null && 'error' in data) {
    const error = (data as { error: unknown }).error;
    if (typeof error === 'object' && error !== null && 'message' in error) {
      const message = (error as { message: unknown }).message;
      return typeof message === 'string' ? message : null;
    }
  }
  return null;
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (axios.isCancel(error)) return new ApiError('cancelled', 'Request cancelled.');
  if (error instanceof AxiosError) {
    if (error.code === AxiosError.ECONNABORTED || error.code === AxiosError.ETIMEDOUT) {
      return new ApiError('timeout', 'The server took too long to answer.');
    }
    if (error.response) {
      const status = error.response.status;
      return new ApiError('http', messageFromBody(error.response.data) ?? `Request failed (HTTP ${status}).`, status);
    }
    return new ApiError('network', 'Could not reach the server. Check your connection.');
  }
  return new ApiError('network', error instanceof Error ? error.message : 'Unexpected network error.');
}

/** Unwraps the `{ success, data, error }` envelope and validates the payload. */
export function unwrap<T>(body: unknown, isValid: (value: unknown) => value is T): T {
  const envelope = body as ApiResponse<unknown> | null;
  if (!envelope || typeof envelope !== 'object' || !('success' in envelope)) {
    throw new ApiError('invalid_response', 'Unexpected response from the server.');
  }
  if (!envelope.success) {
    const message = typeof envelope.error?.message === 'string' ? envelope.error.message : null;
    if (!message) throw new ApiError('invalid_response', 'Unexpected response from the server.');
    throw new ApiError('rejected', message);
  }
  if (!isValid(envelope.data)) throw new ApiError('invalid_response', 'The server sent malformed data.');
  return envelope.data;
}
