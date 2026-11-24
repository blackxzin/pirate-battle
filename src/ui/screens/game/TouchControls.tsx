import type { GameAction, InputController } from '../../../session/input';
import { HoldButton } from '../../components/Buttons';

type Props = {
  readonly input: InputController;
};

/** On-screen controls (touch and mouse). Each button can be held independently. */
export function TouchControls({ input }: Props) {
  const bind = (action: GameAction) => (pressed: boolean) => input.setVirtual(action, pressed);
  return (
    <div aria-hidden="true">
      <div className="touch-controls touch-controls--move" data-testid="touch-move">
        <HoldButton className="touch-controls__top" icon="forward" label="Sail forward" onChange={bind('forward')} />
        <HoldButton className="touch-controls__left" icon="turn_left" label="Turn left" onChange={bind('turnLeft')} />
        <HoldButton className="touch-controls__right" icon="turn_right" label="Turn right" onChange={bind('turnRight')} />
      </div>
      <div className="touch-controls touch-controls--fire" data-testid="touch-fire">
        <HoldButton className="touch-controls__top" icon="fire_front" label="Fire front cannon" onChange={bind('fireFront')} />
        <HoldButton className="touch-controls__left" icon="fire_left" label="Fire left broadside" onChange={bind('fireLeft')} />
        <HoldButton className="touch-controls__right" icon="fire_right" label="Fire right broadside" onChange={bind('fireRight')} />
      </div>
    </div>
  );
}
