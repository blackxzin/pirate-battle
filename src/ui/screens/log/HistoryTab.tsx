import { useState } from 'react';
import { useHistory } from '../../../api/queries';
import { endReasonLabel, formatDuration, formatPlayedAt } from '../../format';
import { Pagination, QueryStatus, UpdatingHint } from './QueryStatus';

type Props = {
  readonly playerId: string;
  readonly playerName: string;
  readonly highlightMatchId: string | null;
};

export function HistoryTab({ playerId, playerName, highlightMatchId }: Props) {
  const [page, setPage] = useState(1);
  const query = useHistory(playerId, page);
  return (
    <>
      <p className="subtitle">{playerName} · your recent battles</p>
      <UpdatingHint query={query} />
      <div className="table-wrap">
        <QueryStatus query={query} label="your match history" emptyMessage="No battles recorded yet. Set sail!">
          {(data) => (
            <>
              <table className="log-table" data-testid="history-table">
                <caption className="visually-hidden">Match history, page {data.meta.page}</caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Points</th>
                    <th scope="col">Duration</th>
                    <th scope="col">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((match) => (
                    <tr key={match.matchId} data-highlight={match.matchId === highlightMatchId}>
                      <td>{formatPlayedAt(match.playedAt)}</td>
                      <td className="points">{match.score}</td>
                      <td>{formatDuration(match.durationMs)}</td>
                      <td className={`result--${match.endReason}`}>{endReasonLabel(match.endReason)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination page={page} totalPages={data.meta.totalPages} label="Match history" onChange={setPage} />
            </>
          )}
        </QueryStatus>
      </div>
    </>
  );
}
