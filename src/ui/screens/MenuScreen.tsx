import { usePendingMatches } from '../../api/MatchSyncProvider';
import { CONTROL_HELP } from '../../session/input';
import { MenuButton } from '../components/Buttons';
import { Panel } from '../components/Panel';
import { navigate } from '../router';
import { assetUrl } from '../../assetUrl';

type Props = {
  readonly onPlay: () => void;
};

export function MenuScreen({ onPlay }: Props) {
  const pending = usePendingMatches();
  return (
    <main className="screen">
      <Panel>
        <h1 className="visually-hidden">Pirate Battle</h1>
        <img className="title-art" src={assetUrl('ui/menu/title_pirate_battle.png')} alt="" width={384} height={128} />
        <p className="tagline">Set sail. Take command.</p>
        <div className="button-row">
          <MenuButton onClick={onPlay}>Play</MenuButton>
          <MenuButton onClick={() => navigate('options')}>Options</MenuButton>
        </div>
        <section aria-labelledby="controls-heading">
          <h2 className="subtitle" id="controls-heading">
            Controls
          </h2>
          <dl className="controls-list">
            {CONTROL_HELP.map((item) => (
              <div key={item.action} className="controls-list__row">
                <dt>{item.action}</dt>
                <dd>{item.keys}</dd>
              </div>
            ))}
          </dl>
          <p className="field__hint">On touch screens use the on-screen buttons. Navigate the islands. Survive the battle.</p>
        </section>
        {pending.length > 0 && (
          <p className="notice">
            {pending.length === 1 ? '1 battle is' : `${pending.length} battles are`} waiting to be recorded. They will sync
            automatically.
          </p>
        )}
        <nav className="button-row" aria-label="Captain's log">
          <MenuButton variant="secondary" size="small" onClick={() => navigate('ranking')}>
            Ranking
          </MenuButton>
          <MenuButton variant="secondary" size="small" onClick={() => navigate('history')}>
            Match History
          </MenuButton>
        </nav>
      </Panel>
    </main>
  );
}
