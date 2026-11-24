import { useState } from 'react';
import type { PauseReason } from '../../../session/gameSession';
import { MenuButton } from '../../components/Buttons';
import { Dialog } from '../../components/Dialog';
import { Panel } from '../../components/Panel';
import { OptionsForm } from '../OptionsForm';

type Props = {
  readonly reason: PauseReason | null;
  readonly onResume: () => void;
  readonly onMainMenu: () => void;
};

const REASON_TEXT: Record<PauseReason, string> = {
  manual: 'Ready when you are.',
  focus: 'The game paused because the window lost focus.',
  hidden: 'The game paused while the tab was hidden.',
};

export function PauseDialog({ reason, onResume, onMainMenu }: Props) {
  const [view, setView] = useState<'pause' | 'options'>('pause');

  if (view === 'options') {
    return (
      <Dialog labelledBy="pause-options-title" onEscape={() => setView('pause')}>
        <Panel title="Options" titleId="pause-options-title" as="div">
          <OptionsForm inMatch />
          <MenuButton onClick={() => setView('pause')}>Back</MenuButton>
        </Panel>
      </Dialog>
    );
  }

  return (
    <Dialog labelledBy="pause-title" describedBy="pause-reason" onEscape={onResume}>
      <Panel title="Paused" titleId="pause-title" as="div">
        <p id="pause-reason">{REASON_TEXT[reason ?? 'manual']}</p>
        <MenuButton onClick={onResume}>Resume</MenuButton>
        <MenuButton onClick={() => setView('options')}>Options</MenuButton>
        <MenuButton onClick={onMainMenu}>Main Menu</MenuButton>
        <p className="field__hint">Leaving now abandons the battle; it will not be recorded.</p>
      </Panel>
    </Dialog>
  );
}
