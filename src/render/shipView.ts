import { Container, Sprite } from 'pixi.js';
import type { Ship, ShipKind } from '../game/types';
import type { GameTextures } from './assets';
import type { HealthBar, HealthBarFactory } from './healthBar';

/** Hull colours in the atlas: ship_{stage * 6 + colour + 1}. */
const COLOR_INDEX: Record<ShipKind, number> = { player: 4, chaser: 2, shooter: 1 };
const COLORS_PER_STAGE = 6;
export const WRECK_STAGE = 3;
const BAR_OFFSET = 18;
const BAR_SCALE: Record<ShipKind, number> = { player: 0.5, chaser: 0.4, shooter: 0.45 };

/** 0 = intact, 1 = damaged, 2 = heavily damaged, 3 = wreck. */
export function damageStage(health: number, maxHealth: number): number {
  if (health <= 0) return WRECK_STAGE;
  const ratio = health / maxHealth;
  if (ratio > 0.66) return 0;
  if (ratio > 0.33) return 1;
  return 2;
}

export function shipFrame(kind: ShipKind, stage: number): string {
  return `ship_${stage * COLORS_PER_STAGE + COLOR_INDEX[kind] + 1}`;
}

/**
 * Pixi view for one ship: a container holding the hull sprite and the fire
 * shown on heavy damage (Pixi v8 only lets containers own children), plus a
 * health bar on its own layer so it never rotates with the hull.
 */
export class ShipView {
  readonly view: Container;
  private readonly hull: Sprite;
  readonly bar: HealthBar;
  private readonly fire: Sprite;
  private stage = -1;
  private flicker = 0;

  constructor(
    readonly ship: Ship,
    private readonly textures: GameTextures,
    bars: HealthBarFactory,
    shipLayer: Container,
    barLayer: Container,
  ) {
    this.hull = new Sprite(textures.get(shipFrame(ship.kind, 0)));
    this.hull.anchor.set(0.5);
    this.fire = new Sprite(textures.get('fire_1'));
    this.fire.anchor.set(0.5, 0.9);
    this.fire.visible = false;
    this.view = new Container();
    this.view.addChild(this.hull, this.fire);
    this.bar = bars.create(BAR_SCALE[ship.kind]);
    shipLayer.addChild(this.view);
    barLayer.addChild(this.bar.view);
    this.sync(0);
  }

  sync(dt: number): void {
    const { ship } = this;
    this.view.position.set(ship.x, ship.y);
    // Sprites face up (-y); simulation angle 0 faces +x.
    this.view.rotation = ship.angle + Math.PI / 2;
    const stage = damageStage(ship.health, ship.maxHealth);
    if (stage !== this.stage) {
      this.stage = stage;
      this.hull.texture = this.textures.get(shipFrame(ship.kind, Math.min(stage, 2)));
      this.fire.visible = stage >= 2;
    }
    if (this.fire.visible) {
      this.flicker += dt;
      this.fire.texture = this.textures.get(Math.floor(this.flicker * 8) % 2 === 0 ? 'fire_1' : 'fire_2');
    }
    const top = ship.y - ship.radius - BAR_OFFSET;
    this.bar.view.position.set(ship.x, Math.max(10, top));
    this.bar.update(ship.health, ship.maxHealth, ship.kind === 'player');
  }

  destroy(): void {
    this.view.destroy({ children: true });
    this.bar.view.destroy({ children: true });
  }
}
