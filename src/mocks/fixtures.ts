import type { MatchConfigSummary, MatchRecord } from '../api/contracts';

/** Rival captains used to populate the ranking. Deterministic by design. */
const RIVALS = [
  'Captain Flint',
  'Red Sparrow',
  'Storm Rider',
  'Sea Wolf',
  'Black Gull',
  'Iron Anne',
  'Salty Pete',
  'Coral Queen',
  'Old Tom',
  'Mad Morgan',
  'Grey Fin',
  'Blue Marlin',
] as const;

function rivalRecords(config: MatchConfigSummary, count: number, startDay: number): MatchRecord[] {
  return Array.from({ length: count }, (_, index) => {
    const name = RIVALS[index % RIVALS.length] ?? 'Rival';
    const score = Math.max(0, 38 - index * 2 - (index % 3));
    const defeated = index % 4 === 3;
    const durationMs = defeated ? config.sessionSeconds * 1000 - 9000 - index * 1000 : config.sessionSeconds * 1000;
    const day = String(startDay - Math.floor(index / 4)).padStart(2, '0');
    const minute = String((index * 7) % 60).padStart(2, '0');
    return {
      matchId: `fixture-${config.sessionSeconds}-${config.spawnIntervalSeconds}-${index + 1}`,
      playerId: `rival-${name.toLowerCase().replace(/\s+/g, '-')}`,
      playerName: name,
      playedAt: `2026-11-${day}T${String(12 + (index % 10)).padStart(2, '0')}:${minute}:00.000Z`,
      score,
      durationMs,
      endReason: defeated ? 'defeated' : 'time_up',
      config,
    };
  });
}

export const FIXTURE_MATCHES: readonly MatchRecord[] = [
  ...rivalRecords({ sessionSeconds: 120, spawnIntervalSeconds: 3 }, 18, 22),
  ...rivalRecords({ sessionSeconds: 60, spawnIntervalSeconds: 2 }, 7, 20),
  ...rivalRecords({ sessionSeconds: 180, spawnIntervalSeconds: 3 }, 6, 19),
];
