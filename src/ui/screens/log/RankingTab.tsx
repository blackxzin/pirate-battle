import { useState } from 'react';
import type { MatchConfigSummary } from '../../../api/contracts';
import { useRanking } from '../../../api/queries';
import { configLabel, formatPlayedAt } from '../../format';
import { Pagination, QueryStatus, UpdatingHint } from './QueryStatus';

type Props = {
  readonly config: MatchConfigSummary;
  readonly playerId: string;
};

/** Ranking for the player's current configuration (matches compared like-for-like). */
export function RankingTab({ config, playerId }: Props) {
  const [page, setPage] = useState(1);
  const query = useRanking(config, page);
  return (
    <>
      <p className="subtitle">{configLabel(config)}</p>
      <UpdatingHint query={query} />
      <div className="table-wrap">
        <QueryStatus query={query} label="the ranking" emptyMessage="No battles recorded for this configuration yet.">
          {(data) => (
            <>
              <table className="log-table" data-testid="ranking-table">
                <caption className="visually-hidden">Ranking, page {data.meta.page}</caption>
                <thead>
                  <tr>
                    <th scope="col">Rank</th>
                    <th scope="col">Captain</th>
                    <th scope="col">Points</th>
                    <th scope="col">Played</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((entry) => {
                    const isYou = entry.playerId === playerId;
                    return (
                      <tr key={entry.matchId} data-highlight={isYou}>
                        <td>{String(entry.rank).padStart(2, '0')}</td>
                        <td>
                          {entry.playerName}
                          {isYou && <span className="badge">You</span>}
                        </td>
                        <td className="points">{entry.score}</td>
                        <td>{formatPlayedAt(entry.playedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <Pagination page={page} totalPages={data.meta.totalPages} label="Ranking" onChange={setPage} />
            </>
          )}
        </QueryStatus>
      </div>
    </>
  );
}
