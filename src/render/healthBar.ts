import { Container, Rectangle, Sprite, Texture } from 'pixi.js';
import type { GameTextures } from './assets';

/** Layout from ui_sheet.json `ui.layout` for the enemy_health group (logical px). */
const FRAME = 'enemy_health_frame';
const FILL_RECT = { x: 24, y: 12, w: 112, h: 15 } as const;
const FRAME_SIZE = { w: 160, h: 40 } as const;
const BUCKETS = 50;

/**
 * Builds cropped fill textures (clip_axis: x, clip_origin: left) instead of
 * stretching the fill, matching the atlas metadata. Textures are cached per
 * percentage bucket and shared by every bar.
 */
class FillTextureCache {
  private readonly cache = new Map<string, Texture>();

  constructor(private readonly textures: GameTextures) {}

  get(color: 'green' | 'red', ratio: number): Texture {
    const bucket = Math.max(0, Math.min(BUCKETS, Math.ceil(ratio * BUCKETS)));
    const key = `${color}:${bucket}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const base = this.textures.get(`enemy_health_fill_${color}`);
    const width = Math.max(1, (FILL_RECT.w * bucket) / BUCKETS);
    const texture = new Texture({
      source: base.source,
      frame: new Rectangle(base.frame.x + FILL_RECT.x, base.frame.y + FILL_RECT.y, width, FILL_RECT.h),
    });
    this.cache.set(key, texture);
    return texture;
  }

  destroy(): void {
    this.cache.forEach((texture) => texture.destroy(false));
    this.cache.clear();
  }
}

export class HealthBarFactory {
  private readonly fills: FillTextureCache;

  constructor(private readonly textures: GameTextures) {
    this.fills = new FillTextureCache(textures);
  }

  create(scale: number): HealthBar {
    return new HealthBar(this.textures.get(FRAME), this.fills, scale);
  }

  destroy(): void {
    this.fills.destroy();
  }
}

export class HealthBar {
  readonly view = new Container();
  private readonly fill: Sprite;
  private lastKey = '';

  constructor(frame: Texture, private readonly fills: FillTextureCache, scale: number) {
    const frameSprite = new Sprite(frame);
    this.fill = new Sprite(Texture.EMPTY);
    this.fill.position.set(FILL_RECT.x, FILL_RECT.y);
    this.view.addChild(frameSprite, this.fill);
    this.view.pivot.set(FRAME_SIZE.w / 2, FRAME_SIZE.h / 2);
    this.view.scale.set(scale);
  }

  update(health: number, maxHealth: number, isPlayer: boolean): void {
    const ratio = maxHealth > 0 ? health / maxHealth : 0;
    const color = isPlayer && ratio > 0.35 ? 'green' : ratio > 0.5 ? 'green' : 'red';
    const key = `${color}:${Math.ceil(ratio * BUCKETS)}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.fill.texture = this.fills.get(color, ratio);
    this.fill.visible = ratio > 0;
  }
}
