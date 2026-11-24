import { useState, type KeyboardEvent } from 'react';
import { usePendingMatches, useMatchSync } from '../../../api/MatchSyncProvider';
import { loadLastResult, loadOptions, loadPlayer } from '../../../storage/preferences';
import { MenuButton } from '../../components/Buttons';
import { Panel } from '../../components/Panel';
import { navigate } from '../../router';
import { HistoryTab } from './HistoryTab';
import { RankingTab } from './RankingTab';

type Tab = 'ranking' | 'history';

type Props = {
  readonly tab: Tab;
};

const TABS: ReadonlyArray<{ readonly id: Tab; readonly label: string }> = [
  { id: 'ranking', label: 'Ranking' },
  { id: 'history', label: 'Match History' },
];

export function CaptainsLog({ tab }: Props) {
  const [context] = useState(() => {
    const options = loadOptions();
    return {
      player: loadPlayer(),
      config: { sessionSeconds: options.sessionSeconds, spawnIntervalSeconds: options.spawnIntervalSeconds },
      lastMatchId: loadLastResult()?.matchId ?? null,
    };
  });
  const pending = usePendingMatches();
  const { retryAll } = useMatchSync();

  const handleTabKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next = tab === 'ranking' ? 'history' : 'ranking';
    navigate(next, { replace: true });
    requestAnimationFrame(() => document.getElementById(`tab-${next}`)?.focus());
  };

  return (
    <main className="screen">
      <Panel wide title="Captain's Log" titleId="log-title">
        <div className="button-row" role="tablist" aria-label="Captain's log" onKeyDown={handleTabKeys}>
          {TABS.map((item) => (
            <MenuButton
              key={item.id}
              id={`tab-${item.id}`}
              size="small"
              variant={item.id === tab ? 'primary' : 'secondary'}
              role="tab"
              aria-selected={item.id === tab}
              aria-controls={`panel-${item.id}`}
              tabIndex={item.id === tab ? 0 : -1}
              onClick={() => navigate(item.id, { replace: true })}
            >
              {item.label}
            </MenuButton>
          ))}
        </div>
        {pending.length > 0 && (
          <p className="notice">
            {pending.length === 1 ? '1 battle is' : `${pending.length} battles are`} waiting to be recorded.{' '}
            <button type="button" className="text-button" onClick={retryAll}>
              Retry now
            </button>
          </p>
        )}
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="panel__inner tab-panel">
          {tab === 'ranking' ? (
            <RankingTab config={context.config} playerId={context.player.id} />
          ) : (
            <HistoryTab playerId={context.player.id} playerName={context.player.name} highlightMatchId={context.lastMatchId} />
          )}
        </div>
        <MenuButton onClick={() => navigate('menu')}>Main Menu</MenuButton>
      </Panel>
    </main>
  );
}
