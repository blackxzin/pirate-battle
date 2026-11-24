import { Container, Sprite, TilingSprite, type Application } from 'pixi.js';
import { TILE_SIZE, islandTileFrame, type ArenaDefinition } from '../game/arena';
import type { Simulation } from '../game/simulation';
import type { GameEvent, Projectile, Ship } from '../game/types';
import type { GameTextures } from './assets';
import { EffectsLayer } from './effects';
import { HealthBarFactory } from './healthBar';
import { WRECK_STAGE, ShipView, shipFrame } from './shipView';

export interface Viewport {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

/** Letterboxes the logical arena into the canvas, preserving aspect ratio. */
export function fitArena(arena: ArenaDefinition, width: number, height: number): Viewport {
  const scale = Math.min(width / arena.width, height / arena.height);
  return {
    scale,
    offsetX: (width - arena.width * scale) / 2,
    offsetY: (height - arena.height * scale) / 2,
  };
}

/**
 * Draws the simulation. It never mutates game state: each frame it reads the
 * entities, creates/destroys views to match them and turns events into effects.
 */
export class GameRenderer {
  readonly world = new Container();
  private readonly shipLayer = new Container();
  private readonly projectileLayer = new Container();
  private readonly barLayer = new Container();
  private readonly effects: EffectsLayer;
  private readonly bars: HealthBarFactory;
  private readonly shipViews = new Map<number, ShipView>();
  private readonly projectileViews = new Map<number, Sprite>();
  private readonly projectilePool: Sprite[] = [];

  constructor(
    private readonly app: Application,
    private readonly textures: GameTextures,
    private readonly sim: Simulation,
  ) {
    this.effects = new EffectsLayer(textures);
    this.bars = new HealthBarFactory(textures);
    this.world.addChild(
      this.buildWater(sim.arena),
      this.buildIslands(sim.arena),
      this.effects.wrecks,
      this.shipLayer,
      this.projectileLayer,
      this.effects.view,
      this.barLayer,
    );
    app.stage.addChild(this.world);
    this.resize(app.screen.width, app.screen.height);
    this.render(0, []);
  }

  get stats(): { ships: number; projectiles: number; effects: number } {
    return { ships: this.shipViews.size, projectiles: this.projectileViews.size, effects: this.effects.count };
  }

  resize(width: number, height: number): Viewport {
    const viewport = fitArena(this.sim.arena, width, height);
    this.world.scale.set(viewport.scale);
    this.world.position.set(viewport.offsetX, viewport.offsetY);
    return viewport;
  }

  /** Applies events then syncs views. `dt` is simulated time for effects. */
  render(dt: number, events: readonly GameEvent[]): void {
    events.forEach((event) => this.handleEvent(event));
    this.syncShips(dt);
    this.syncProjectiles();
    this.effects.update(dt);
  }

  destroy(): void {
    this.shipViews.forEach((view) => view.destroy());
    this.shipViews.clear();
    this.effects.clear();
    this.bars.destroy();
    this.projectilePool.forEach((sprite) => sprite.destroy());
    this.app.stage.removeChild(this.world);
    this.world.destroy({ children: true });
  }

  private buildWater(arena: ArenaDefinition): TilingSprite {
    return new TilingSprite({ texture: this.textures.get('tile_73'), width: arena.width, height: arena.height });
  }

  private buildIslands(arena: ArenaDefinition): Container {
    const layer = new Container();
    for (const island of arena.islands) {
      for (let row = 0; row < island.rows; row += 1) {
        for (let col = 0; col < island.cols; col += 1) {
          const tile = new Sprite(this.textures.get(islandTileFrame(island.style, col, row, island.cols, island.rows)));
          tile.position.set((island.tileX + col) * TILE_SIZE, (island.tileY + row) * TILE_SIZE);
          layer.addChild(tile);
        }
      }
    }
    for (const decoration of arena.decorations) {
      const sprite = new Sprite(this.textures.get(decoration.frame));
      sprite.anchor.set(0.5);
      sprite.position.set(decoration.x, decoration.y);
      sprite.scale.set(decoration.scale ?? 1);
      sprite.rotation = decoration.rotation ?? 0;
      layer.addChild(sprite);
    }
    return layer;
  }

  private handleEvent(event: GameEvent): void {
    switch (event.type) {
      case 'fire':
        this.effects.muzzleFlash(event.x, event.y, event.angle, 34);
        break;
      case 'hit':
        this.effects.impact(event.x, event.y);
        break;
      case 'projectile_end':
        this.effects.splash(event.x, event.y);
        break;
      case 'ram':
        this.effects.explosion(event.x, event.y);
        break;
      case 'destroyed':
        this.effects.explosion(event.x, event.y);
        this.effects.wreck(shipFrame(event.kind, WRECK_STAGE), event.x, event.y, event.angle + Math.PI / 2);
        this.removeShipView(event.shipId);
        break;
      default:
        break;
    }
  }

  private syncShips(dt: number): void {
    const live = new Set<number>();
    const ships: Ship[] = this.sim.player.alive ? [this.sim.player, ...this.sim.enemies] : [...this.sim.enemies];
    for (const ship of ships) {
      if (!ship.alive) continue;
      live.add(ship.id);
      let view = this.shipViews.get(ship.id);
      if (!view) {
        view = new ShipView(ship, this.textures, this.bars, this.shipLayer, this.barLayer);
        this.shipViews.set(ship.id, view);
      }
      view.sync(dt);
    }
    for (const id of [...this.shipViews.keys()]) {
      if (!live.has(id)) this.removeShipView(id);
    }
  }

  private removeShipView(id: number): void {
    const view = this.shipViews.get(id);
    if (!view) return;
    view.destroy();
    this.shipViews.delete(id);
  }

  private syncProjectiles(): void {
    const live = new Set<number>();
    for (const projectile of this.sim.projectiles) {
      if (!projectile.alive) continue;
      live.add(projectile.id);
      const sprite = this.projectileViews.get(projectile.id) ?? this.acquireProjectile(projectile);
      sprite.position.set(projectile.x, projectile.y);
    }
    for (const [id, sprite] of this.projectileViews) {
      if (live.has(id)) continue;
      sprite.visible = false;
      this.projectilePool.push(sprite);
      this.projectileViews.delete(id);
    }
  }

  private acquireProjectile(projectile: Projectile): Sprite {
    const sprite = this.projectilePool.pop() ?? this.createProjectileSprite();
    sprite.visible = true;
    sprite.tint = projectile.faction === 'player' ? 0xffffff : 0xffb0a0;
    this.projectileViews.set(projectile.id, sprite);
    return sprite;
  }

  private createProjectileSprite(): Sprite {
    const sprite = new Sprite(this.textures.get('cannon_ball'));
    sprite.anchor.set(0.5);
    sprite.scale.set(1.2);
    this.projectileLayer.addChild(sprite);
    return sprite;
  }
}
