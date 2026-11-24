import type { ButtonHTMLAttributes, PointerEvent } from 'react';
import { sound } from '../../audio/sound';
import { assetUrl } from '../../assetUrl';

type MenuButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: 'primary' | 'secondary';
  readonly size?: 'normal' | 'small';
};

export function MenuButton({ variant = 'primary', size = 'normal', className, onClick, ...rest }: MenuButtonProps) {
  const classes = ['menu-button', variant === 'secondary' && 'menu-button--secondary', size === 'small' && 'menu-button--small', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      className={classes}
      onClick={(event) => {
        sound.unlock();
        sound.play('ui_click', 0.35);
        onClick?.(event);
      }}
      {...rest}
    />
  );
}

export type IconName =
  | 'close'
  | 'fire_front'
  | 'fire_left'
  | 'fire_right'
  | 'forward'
  | 'home'
  | 'minus'
  | 'pause'
  | 'play'
  | 'plus'
  | 'restart'
  | 'settings'
  | 'turn_left'
  | 'turn_right';

type RoundButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  readonly icon: IconName;
  readonly label: string;
};

export function RoundButton({ icon, label, className, ...rest }: RoundButtonProps) {
  return (
    <button type="button" className={['round-button', className].filter(Boolean).join(' ')} aria-label={label} title={label} {...rest}>
      <img src={assetUrl(`ui/controls/icon_${icon}.png`)} alt="" width={30} height={30} draggable={false} />
    </button>
  );
}

type HoldButtonProps = {
  readonly icon: IconName;
  readonly label: string;
  readonly className?: string;
  readonly onChange: (pressed: boolean) => void;
};

/**
 * Press-and-hold control for touch/mouse. Uses pointer capture so sliding a
 * finger off the button still releases it, and supports multi-touch (move and
 * fire simultaneously).
 */
export function HoldButton({ icon, label, className, onChange }: HoldButtonProps) {
  const press = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic or already-released pointers cannot be captured; holding still works.
    }
    event.currentTarget.dataset.pressed = 'true';
    onChange(true);
  };
  const release = (event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.dataset.pressed = 'false';
    onChange(false);
  };
  return (
    <RoundButton
      icon={icon}
      label={label}
      className={className}
      tabIndex={-1}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(event) => event.preventDefault()}
    />
  );
}
