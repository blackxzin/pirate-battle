import { MenuButton } from '../components/Buttons';
import { Panel } from '../components/Panel';
import { navigate } from '../router';
import { NetworkLab } from './NetworkLab';
import { OptionsForm } from './OptionsForm';

export function OptionsScreen() {
  return (
    <main className="screen">
      <Panel title="Options" titleId="options-title">
        <OptionsForm />
        <NetworkLab />
        <MenuButton onClick={() => navigate('menu')}>Main Menu</MenuButton>
      </Panel>
    </main>
  );
}
