#!/usr/bin/env node
/**
 * Prepares the challenge asset pack for the web build.
 *
 * - Copies the UI atlas, tile sheet, menu/HUD PNGs and logo into public/assets.
 * - Converts the Starling/Sparrow XML atlas (ships_miscellaneous_sheet.xml)
 *   into the Pixi/TexturePacker JSON hash format.
 * - Generates a JSON atlas for the 64x64 tile sheet (no margin, 16 columns).
 * - Transcodes WAV sound effects to MP3 with ffmpeg (falls back to copying WAV).
 *
 * Usage: node scripts/prepare-assets.mjs <path-to-challenge-assets-dir>
 * The output is committed, so this only needs to run when the source pack changes.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const TILE_SIZE = 64;
const TILE_COLUMNS = 16;
const TILE_ROWS = 6;

const sourceDir = resolve(process.argv[2] ?? '../challenge-src/assets');
const outDir = resolve('public/assets');

if (!existsSync(sourceDir)) {
  console.error(`Asset source directory not found: ${sourceDir}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

function copy(relative, target = relative) {
  cpSync(join(sourceDir, relative), join(outDir, target), { recursive: true });
}

function convertSparrowAtlas(xmlFile, imageFile, jsonFile) {
  const xml = readFileSync(join(sourceDir, xmlFile), 'utf8');
  const pattern =
    /<SubTexture\s+name="([^"]+)"\s+x="(\d+)"\s+y="(\d+)"\s+width="(\d+)"\s+height="(\d+)"\s*\/>/g;
  const frames = {};
  for (const match of xml.matchAll(pattern)) {
    const [, name, x, y, w, h] = match;
    const key = name.replace(/\.png$/, '');
    const width = Number(w);
    const height = Number(h);
    frames[key] = {
      frame: { x: Number(x), y: Number(y), w: width, h: height },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: width, h: height },
      sourceSize: { w: width, h: height },
    };
  }
  if (Object.keys(frames).length === 0) {
    throw new Error(`No SubTexture entries parsed from ${xmlFile}`);
  }
  const json = { frames, meta: { image: basename(imageFile), format: 'RGBA8888', scale: '1' } };
  writeFileSync(join(outDir, jsonFile), JSON.stringify(json));
  return Object.keys(frames).length;
}

function generateTileAtlas() {
  const frames = {};
  for (let index = 1; index <= TILE_COLUMNS * TILE_ROWS; index += 1) {
    const column = (index - 1) % TILE_COLUMNS;
    const row = Math.floor((index - 1) / TILE_COLUMNS);
    frames[`tile_${index}`] = {
      frame: { x: column * TILE_SIZE, y: row * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: TILE_SIZE, h: TILE_SIZE },
      sourceSize: { w: TILE_SIZE, h: TILE_SIZE },
    };
  }
  const json = { frames, meta: { image: 'tiles_sheet.png', format: 'RGBA8888', scale: '1' } };
  writeFileSync(join(outDir, 'tiles_sheet.json'), JSON.stringify(json));
}

function hasFfmpeg() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function transcodeSounds() {
  const soundOut = join(outDir, 'sounds');
  mkdirSync(soundOut, { recursive: true });
  const canTranscode = hasFfmpeg();
  const files = readdirSync(join(sourceDir, 'sounds')).filter((file) => file.endsWith('.wav'));
  for (const file of files) {
    const input = join(sourceDir, 'sounds', file);
    if (!canTranscode) {
      cpSync(input, join(soundOut, file));
      continue;
    }
    const output = join(soundOut, file.replace(/\.wav$/, '.mp3'));
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', input, '-codec:a', 'libmp3lame', '-q:a', '5', output]);
  }
  return { count: files.length, format: canTranscode ? 'mp3' : 'wav' };
}

copy('spritesheet/ui_sheet.json', 'ui_sheet.json');
copy('spritesheet/ui_sheet.png', 'ui_sheet.png');
copy('spritesheet/ships_miscellaneous_sheet.png', 'ships_sheet.png');
copy('tilesheet/tiles_sheet.png', 'tiles_sheet.png');
copy('png/default/ui', 'ui');
copy('ui_scene_background.png', 'ui_scene_background.png');
copy('logo_jungle_gaming.svg', 'logo_jungle_gaming.svg');

const shipFrames = convertSparrowAtlas(
  'spritesheet/ships_miscellaneous_sheet.xml',
  'ships_sheet.png',
  'ships_sheet.json',
);
generateTileAtlas();
const sounds = transcodeSounds();

console.log(`Ships atlas: ${shipFrames} frames. Tiles atlas: ${TILE_COLUMNS * TILE_ROWS} frames.`);
console.log(`Sounds: ${sounds.count} files as ${sounds.format}. Output: ${outDir}`);
