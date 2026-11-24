import type { EndReason } from '../game/types';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;

export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatDuration(ms: number): string {
  return formatClock(Math.floor(ms / 1000));
}

/** "08 SEP 2026 · 19:36" in the viewer's local time. */
export function formatPlayedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const day = String(date.getDate()).padStart(2, '0');
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${day} ${MONTHS[date.getMonth()] ?? ''} ${date.getFullYear()} · ${time}`;
}

export function endReasonLabel(reason: EndReason): string {
  return reason === 'time_up' ? 'Time up' : 'Defeated';
}

export function configLabel(config: { sessionSeconds: number; spawnIntervalSeconds: number }): string {
  return `${config.sessionSeconds} second battles · ${config.spawnIntervalSeconds} second spawn interval`;
}
