import { Assets, type Spritesheet, type Texture } from 'pixi.js';
import { assetUrl } from '../assetUrl';

export const ASSET_URLS = {
  ui: assetUrl('ui_sheet.json'),
  ships: assetUrl('ships_sheet.json'),
  tiles: assetUrl('tiles_sheet.json'),
} as const;

export class AssetLoadError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'AssetLoadError';
  }
}

export interface GameTextures {
  readonly get: (frame: string) => Texture;
}

function buildTextures(sheets: readonly Spritesheet[]): GameTextures {
  const frames = new Map<string, Texture>();
  for (const sheet of sheets) {
    for (const [name, texture] of Object.entries(sheet.textures)) frames.set(name, texture);
  }
  return {
    get: (frame) => {
      const texture = frames.get(frame);
      if (!texture) throw new AssetLoadError(`Missing texture frame "${frame}"`);
      return texture;
    },
  };
}

/**
 * Loads the three atlases once. Pixi's Assets cache makes later calls instant
 * (textures are reused across matches); failed URLs are evicted from the cache
 * by Pixi, so calling this again retries cleanly.
 */
export async function loadGameTextures(onProgress: (progress: number) => void): Promise<GameTextures> {
  const urls = Object.values(ASSET_URLS);
  // Decode the atlas PNGs as <img> elements instead of ImageBitmaps. Firefox
  // warns when a premultiplied upload comes from a non-DOM source, and three
  // atlases loaded once gain nothing measurable from worker decoding.
  Assets.setPreferences({ preferCreateImageBitmap: false, preferWorkers: false });
  try {
    const loaded = await Assets.load<Spritesheet>(urls, (progress) => onProgress(progress));
    const sheets = urls.map((url) => loaded[url]);
    if (sheets.some((sheet) => !sheet?.textures)) {
      throw new AssetLoadError('One or more sprite sheets are invalid.');
    }
    const textures = buildTextures(sheets as Spritesheet[]);
    // Validate critical frames before combat starts.
    ['ship_1', 'cannon_ball', 'explosion_1', 'tile_73', 'enemy_health_frame'].forEach((frame) => textures.get(frame));
    onProgress(1);
    return textures;
  } catch (error: unknown) {
    if (error instanceof AssetLoadError) throw error;
    throw new AssetLoadError('Could not load the game assets. Check your connection and try again.', error);
  }
}
