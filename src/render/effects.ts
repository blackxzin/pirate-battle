import { Container, Graphics, Sprite } from 'pixi.js';
import type { GameTextures } from './assets';

interface Effect {
  readonly view: Container;
  age: number;
  readonly duration: number;
  readonly update: (progress: number) => void;
}

/**
 * Short-lived visual effects (muzzle flashes, explosions, splashes, sinking
 * wrecks). Advanced with simulation time so they freeze while paused.
 */
export class EffectsLayer {
  readonly view = new Container();
  readonly wrecks = new Container();
  private effects: Effect[] = [];

  constructor(private readonly textures: GameTextures) {}

  get count(): number {
    return this.effects.length;
  }

  muzzleFlash(x: number, y: number, angle: number, distance: number): void {
    const sprite = new Sprite(this.textures.get('explosion_3'));
    sprite.anchor.set(0.5);
    sprite.position.set(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance);
    sprite.scale.set(0.45);
    this.add(sprite, 0.18, (t) => {
      sprite.alpha = 1 - t;
      sprite.scale.set(0.45 + t * 0.25);
    });
  }

  impact(x: number, y: number): void {
    const sprite = new Sprite(this.textures.get('explosion_2'));
    sprite.anchor.set(0.5);
    sprite.position.set(x, y);
    // Deterministic variation keeps visual tests reproducible.
    sprite.rotation = (x * 7 + y * 13) % (Math.PI * 2);
    this.add(sprite, 0.35, (t) => {
      sprite.alpha = 1 - t;
      sprite.scale.set(0.5 + t * 0.4);
    });
  }

  explosion(x: number, y: number): void {
    const sprite = new Sprite(this.textures.get('explosion_1'));
    sprite.anchor.set(0.5);
    sprite.position.set(x, y);
    this.add(sprite, 0.6, (t) => {
      sprite.alpha = t < 0.5 ? 1 : 1 - (t - 0.5) * 2;
      sprite.scale.set(0.6 + t * 0.9);
    });
  }

  splash(x: number, y: number): void {
    const ring = new Graphics().circle(0, 0, 10).stroke({ width: 3, color: 0xffffff, alpha: 0.9 });
    ring.position.set(x, y);
    this.add(ring, 0.5, (t) => {
      ring.alpha = 1 - t;
      ring.scale.set(0.6 + t * 1.4);
    });
  }

  wreck(frame: string, x: number, y: number, rotation: number): void {
    const sprite = new Sprite(this.textures.get(frame));
    sprite.anchor.set(0.5);
    sprite.position.set(x, y);
    sprite.rotation = rotation;
    this.add(
      sprite,
      1.6,
      (t) => {
        sprite.alpha = 1 - t;
        sprite.scale.set(1 - t * 0.25);
        sprite.rotation = rotation + t * 0.35;
      },
      this.wrecks,
    );
  }

  update(dt: number): void {
    const remaining: Effect[] = [];
    for (const effect of this.effects) {
      effect.age += dt;
      const progress = Math.min(1, effect.age / effect.duration);
      effect.update(progress);
      if (progress >= 1) effect.view.destroy();
      else remaining.push(effect);
    }
    this.effects = remaining;
  }

  clear(): void {
    this.effects.forEach((effect) => effect.view.destroy());
    this.effects = [];
  }

  private add(view: Container, duration: number, update: (progress: number) => void, layer: Container = this.view): void {
    layer.addChild(view);
    update(0);
    this.effects.push({ view, age: 0, duration, update });
  }
}
