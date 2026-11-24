import { sound } from '../audio/sound';
import type { GameEvent } from '../game/types';

const FRONT_SHOTS = ['cannon_fire_1', 'cannon_fire_2', 'cannon_fire_3'] as const;
let shotIndex = 0;

/** Maps simulation events to sound effects. Purely presentational. */
export function playEventSounds(events: readonly GameEvent[], playerId: number): void {
  for (const event of events) {
    switch (event.type) {
      case 'fire':
        if (event.weapon === 'front') {
          sound.play(FRONT_SHOTS[shotIndex % FRONT_SHOTS.length] ?? 'cannon_fire_1', 0.45);
          shotIndex += 1;
        } else if (event.weapon === 'enemy') {
          sound.play('cannon_fire_2', 0.25);
        } else {
          sound.play('cannon_broadside', 0.5);
        }
        break;
      case 'hit':
        sound.play(event.targetId === playerId ? 'ship_wood_hit_2' : 'ship_wood_hit_1', 0.5);
        break;
      case 'projectile_end':
        if (event.cause !== 'out_of_bounds') sound.play('cannonball_water_hit_1', 0.2);
        break;
      case 'ram':
        sound.play('ship_collision', 0.6);
        break;
      case 'destroyed':
        sound.play(event.shipId === playerId ? 'ship_sinking' : 'ship_explosion_1', 0.55);
        break;
      case 'score':
        sound.play('score_point', 0.35);
        break;
      case 'ended':
        sound.stopLoops();
        sound.play(event.reason === 'time_up' ? 'game_complete' : 'game_over', 0.6);
        break;
      default:
        break;
    }
  }
}
