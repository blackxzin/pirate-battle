import { assetUrl } from '../assetUrl';

export type SoundName =
  | 'cannon_fire_1'
  | 'cannon_fire_2'
  | 'cannon_fire_3'
  | 'cannon_broadside'
  | 'cannonball_water_hit_1'
  | 'cannonball_water_hit_2'
  | 'ship_wood_hit_1'
  | 'ship_wood_hit_2'
  | 'ship_explosion_1'
  | 'ship_explosion_2'
  | 'ship_collision'
  | 'ship_sinking'
  | 'score_point'
  | 'health_low'
  | 'time_warning'
  | 'game_start'
  | 'game_complete'
  | 'game_over'
  | 'game_pause'
  | 'game_resume'
  | 'ocean_ambience_loop'
  | 'ui_click'
  | 'ui_back'
  | 'ui_open'
  | 'ui_close'
  | 'ui_hover';

const SOUND_BASE = assetUrl('sounds/');

/**
 * Small Web Audio wrapper. Sounds are decoded lazily and cached. Audio is
 * optional: failures are reported once and never block gameplay.
 */
class SoundPlayer {
  private context: AudioContext | null = null;
  private readonly buffers = new Map<SoundName, Promise<AudioBuffer | null>>();
  private readonly loops = new Map<SoundName, AudioBufferSourceNode>();
  private enabled = true;
  private warned = false;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stopLoops();
  }

  /** Must be called from a user gesture to satisfy autoplay policies. */
  unlock(): void {
    const context = this.getContext();
    if (context?.state === 'suspended') void context.resume().catch(() => undefined);
  }

  play(name: SoundName, volume = 0.6): void {
    if (!this.enabled) return;
    void this.start(name, volume, false);
  }

  loop(name: SoundName, volume = 0.3): void {
    if (!this.enabled || this.loops.has(name)) return;
    void this.start(name, volume, true);
  }

  stopLoops(): void {
    this.loops.forEach((source) => {
      try {
        source.stop();
      } catch {
        // Already stopped: nothing to clean up.
      }
    });
    this.loops.clear();
  }

  private getContext(): AudioContext | null {
    if (this.context) return this.context;
    if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') return null;
    this.context = new window.AudioContext();
    return this.context;
  }

  private load(name: SoundName): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(name);
    if (cached) return cached;
    const context = this.getContext();
    const promise = context
      ? fetch(`${SOUND_BASE}${name}.mp3`)
          .then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.arrayBuffer();
          })
          .then((data) => context.decodeAudioData(data))
          .catch((error: unknown) => {
            this.buffers.delete(name);
            if (!this.warned) {
              this.warned = true;
              console.warn('Sound effects unavailable:', error);
            }
            return null;
          })
      : Promise.resolve(null);
    this.buffers.set(name, promise);
    return promise;
  }

  private async start(name: SoundName, volume: number, loop: boolean): Promise<void> {
    const context = this.getContext();
    const buffer = await this.load(name);
    if (!context || !buffer || !this.enabled) return;
    if (loop && this.loops.has(name)) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    gain.gain.value = volume;
    source.buffer = buffer;
    source.loop = loop;
    source.connect(gain).connect(context.destination);
    source.start();
    if (loop) this.loops.set(name, source);
  }
}

export const sound = new SoundPlayer();
