import Phaser from 'phaser';
// ============================================================
//  Pixel character painter — draws every character from code,
//  using the player's chosen colors. No image files needed.
//  គូររូបតួអង្គ pixel ដោយកូដ តាមពណ៌ដែលអ្នកលេងជ្រើសរើស
// ============================================================
import { Appearance, SKIN_TONES } from '../../../shared/game.ts';

export const FRAME_W = 28;
export const FRAME_H = 26;
export const SPRITE_SCALE = 3;
/** where the feet are inside a frame (used as sprite origin) */
export const FEET_ORIGIN_Y = 25 / FRAME_H;

export const FRAMES = ['idle0', 'idle1', 'run0', 'run1', 'run2', 'run3',
  'jump', 'fall', 'punch', 'kick', 'hurt'] as const;
export type FrameName = (typeof FRAMES)[number];

const OUTLINE = '#140c1c';

// ---------- color helpers ----------
function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  const r = c((n >> 16) & 255), g = c((n >> 8) & 255), b = c(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

type Grid = (string | null)[][];
const newGrid = (): Grid => Array.from({ length: FRAME_H }, () => Array(FRAME_W).fill(null));

/** fill a rectangle; x1..x2 and y1..y2 are inclusive */
function rect(g: Grid, x1: number, y1: number, x2: number, y2: number, color: string) {
  for (let y = y1; y <= y2; y++)
    for (let x = x1; x <= x2; x++)
      if (y >= 0 && y < FRAME_H && x >= 0 && x < FRAME_W) g[y][x] = color;
}
const px = (g: Grid, x: number, y: number, c: string) => rect(g, x, y, x, y, c);

interface Palette {
  skin: string; skinDark: string; hair: string; hairDark: string;
  shirt: string; shirtDark: string; pants: string; pantsDark: string; shoes: string; eye: string;
}

function palette(a: Appearance): Palette {
  const skin = SKIN_TONES[a.skin] ?? SKIN_TONES[0];
  return {
    skin, skinDark: shade(skin, 0.8),
    hair: a.hairColor, hairDark: shade(a.hairColor, 0.7),
    shirt: a.shirt, shirtDark: shade(a.shirt, 0.72),
    pants: a.pants, pantsDark: shade(a.pants, 0.72),
    shoes: a.shoes, eye: '#1b1b2a',
  };
}

// ---------- body parts ----------
// The character faces RIGHT. Head box: x 10..15, y 3..8 (+dy).

function drawHead(g: Grid, p: Palette, hair: number, dx: number, dy: number, hurt: boolean) {
  const X = 10 + dx, Y = 3 + dy;
  rect(g, X, Y, X + 5, Y + 5, p.skin);
  px(g, X + 1, Y + 3, p.skinDark);            // ear
  // eye
  if (hurt) { px(g, X + 4, Y + 2, p.eye); px(g, X + 4, Y + 4, p.eye); px(g, X + 3, Y + 3, p.eye); }
  else rect(g, X + 4, Y + 2, X + 4, Y + 3, p.eye);
  px(g, X + 4, Y + 5, p.skinDark);            // mouth hint

  const H = p.hair, D = p.hairDark;
  switch (hair) {
    case 0: // Short
      rect(g, X, Y - 1, X + 5, Y, H); rect(g, X, Y + 1, X, Y + 3, D); break;
    case 1: // Spiky
      px(g, X, Y - 2, H); px(g, X + 2, Y - 2, H); px(g, X + 4, Y - 2, H);
      rect(g, X, Y - 1, X + 5, Y, H); px(g, X + 5, Y + 1, H); rect(g, X, Y + 1, X, Y + 3, D); break;
    case 2: // Long
      rect(g, X, Y - 1, X + 5, Y, H); px(g, X + 5, Y + 1, H);
      rect(g, X - 1, Y + 1, X, Y + 8, D); break;
    case 3: // Bun
      rect(g, X, Y - 1, X + 5, Y, H); rect(g, X - 2, Y - 2, X, Y, D); rect(g, X, Y + 1, X, Y + 2, D); break;
    case 4: // Mohawk
      rect(g, X + 1, Y - 3, X + 3, Y, H); px(g, X + 2, Y - 3, D); break;
    case 5: // Cap (hair color = cap color)
      rect(g, X, Y - 1, X + 5, Y, H); rect(g, X + 3, Y + 1, X + 8, Y + 1, D); rect(g, X, Y + 1, X, Y + 2, '#2a1d16'); break;
    default: // Bald
      px(g, X + 2, Y, '#ffffff'); break;
  }
}

function drawTorso(g: Grid, p: Palette, dx: number, dy: number) {
  rect(g, 10 + dx, 9 + dy, 15 + dx, 15 + dy, p.shirt);
  rect(g, 10 + dx, 9 + dy, 10 + dx, 15 + dy, p.shirtDark);   // back shading
  rect(g, 10 + dx, 16 + dy, 15 + dx, 16 + dy, p.pantsDark);  // belt line
}

/** arm: sleeve rect + hand rect */
function arm(g: Grid, p: Palette, back: boolean, sleeve: number[], hand: number[]) {
  rect(g, sleeve[0], sleeve[1], sleeve[2], sleeve[3], back ? p.shirtDark : p.shirt);
  rect(g, hand[0], hand[1], hand[2], hand[3], back ? p.skinDark : p.skin);
}

/** leg: pants rect + shoe rect */
function leg(g: Grid, p: Palette, back: boolean, pants: number[], shoe: number[]) {
  rect(g, pants[0], pants[1], pants[2], pants[3], back ? p.pantsDark : p.pants);
  rect(g, shoe[0], shoe[1], shoe[2], shoe[3], back ? shade(p.shoes, 0.75) : p.shoes);
}

// ---------- poses ----------
function drawFrame(name: FrameName, a: Appearance): Grid {
  const g = newGrid();
  const p = palette(a);
  const head = (dx = 0, dy = 0, hurt = false) => drawHead(g, p, a.hair, dx, dy, hurt);

  switch (name) {
    case 'idle0':
    case 'idle1': {
      const b = name === 'idle1' ? 1 : 0;
      arm(g, p, true, [9, 10 + b, 9, 13 + b], [9, 14 + b, 9, 15 + b]);
      leg(g, p, true, [10, 17, 12, 22], [10, 23, 13, 24]);
      leg(g, p, false, [13, 17, 15, 22], [13, 23, 16, 24]);
      drawTorso(g, p, 0, b);
      head(0, b);
      arm(g, p, false, [12, 10 + b, 13, 13 + b], [12, 14 + b, 13, 15 + b]);
      break;
    }
    case 'run0':
    case 'run2': {
      const f = name === 'run0' ? 1 : -1; // which leg is forward
      arm(g, p, true, f > 0 ? [14, 10, 15, 12] : [8, 10, 9, 12], f > 0 ? [16, 11, 16, 12] : [7, 12, 7, 13]);
      leg(g, p, true, f > 0 ? [9, 17, 11, 21] : [14, 17, 16, 21], f > 0 ? [8, 22, 10, 23] : [15, 22, 18, 24]);
      leg(g, p, false, f > 0 ? [14, 17, 16, 21] : [9, 17, 11, 21], f > 0 ? [15, 22, 18, 24] : [8, 22, 10, 23]);
      drawTorso(g, p, 0, 0);
      head(0, 0);
      arm(g, p, false, f > 0 ? [9, 10, 10, 12] : [14, 10, 15, 12], f > 0 ? [8, 12, 8, 13] : [16, 11, 16, 12]);
      break;
    }
    case 'run1':
    case 'run3': {
      const up = name === 'run1'; // which leg is lifted
      arm(g, p, true, [10, 10, 11, 13], [10, 14, 11, 14]);
      leg(g, p, true, up ? [11, 17, 13, 20] : [10, 17, 12, 22], up ? [12, 21, 14, 22] : [10, 23, 13, 24]);
      leg(g, p, false, up ? [12, 17, 14, 22] : [13, 17, 15, 20], up ? [12, 23, 15, 24] : [14, 21, 16, 22]);
      drawTorso(g, p, 0, 1);
      head(0, 1);
      arm(g, p, false, [12, 11, 13, 14], [12, 15, 13, 15]);
      break;
    }
    case 'jump': {
      arm(g, p, true, [8, 7, 9, 10], [8, 5, 9, 6]);
      leg(g, p, true, [10, 17, 12, 19], [10, 20, 13, 21]);
      leg(g, p, false, [13, 17, 15, 20], [14, 21, 17, 22]);
      drawTorso(g, p, 0, 0);
      head(0, 0);
      arm(g, p, false, [15, 7, 16, 10], [16, 5, 17, 6]);
      break;
    }
    case 'fall': {
      arm(g, p, true, [7, 9, 9, 10], [5, 8, 6, 9]);
      leg(g, p, true, [9, 17, 11, 22], [8, 23, 11, 24]);
      leg(g, p, false, [14, 17, 16, 22], [15, 23, 18, 24]);
      drawTorso(g, p, 0, 0);
      head(0, 0);
      arm(g, p, false, [16, 9, 18, 10], [19, 8, 20, 9]);
      break;
    }
    case 'punch': {
      arm(g, p, true, [8, 10, 9, 12], [7, 11, 7, 12]);
      leg(g, p, true, [9, 17, 11, 22], [8, 23, 11, 24]);
      leg(g, p, false, [14, 17, 16, 22], [14, 23, 17, 24]);
      drawTorso(g, p, 1, 0);
      head(1, 0);
      arm(g, p, false, [15, 10, 21, 11], [22, 9, 24, 12]); // straight punch!
      break;
    }
    case 'kick': {
      arm(g, p, true, [7, 9, 9, 10], [6, 8, 6, 9]);
      leg(g, p, true, [9, 17, 11, 22], [8, 23, 11, 24]);
      drawTorso(g, p, -1, 0);
      head(-1, 0);
      leg(g, p, false, [14, 15, 21, 17], [22, 14, 25, 17]); // high kick!
      arm(g, p, false, [13, 9, 14, 11], [14, 12, 15, 12]);
      break;
    }
    case 'hurt': {
      arm(g, p, true, [8, 5, 9, 9], [8, 3, 9, 4]);
      leg(g, p, true, [9, 17, 11, 21], [8, 22, 11, 23]);
      leg(g, p, false, [13, 17, 15, 21], [13, 22, 16, 23]);
      drawTorso(g, p, -1, 0);
      head(-2, 0, true);
      arm(g, p, false, [13, 5, 14, 9], [13, 3, 14, 4]);
      break;
    }
  }
  return addOutline(g);
}

/** paint a dark 1px outline around the character (classic pixel-art look) */
function addOutline(g: Grid): Grid {
  const out = g.map((r) => r.slice());
  for (let y = 0; y < FRAME_H; y++)
    for (let x = 0; x < FRAME_W; x++) {
      if (g[y][x]) continue;
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy]?.[x + dx]);
      if (n) out[y][x] = OUTLINE;
    }
  return out;
}

function paint(ctx: CanvasRenderingContext2D, g: Grid, ox: number, oy: number, scale = 1) {
  for (let y = 0; y < FRAME_H; y++)
    for (let x = 0; x < FRAME_W; x++) {
      const c = g[y][x];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
    }
}

/** A canvas containing every frame side by side (a "sprite sheet") */
export function buildSheet(a: Appearance): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = FRAME_W * FRAMES.length;
  c.height = FRAME_H;
  const ctx = c.getContext('2d')!;
  FRAMES.forEach((f, i) => paint(ctx, drawFrame(f, a), i * FRAME_W, 0));
  return c;
}

/** Draw one frame big onto a canvas — used by the character creator preview */
export function drawPreview(canvas: HTMLCanvasElement, a: Appearance, frame: FrameName, flip = false) {
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const scale = Math.floor(Math.min(canvas.width / FRAME_W, canvas.height / FRAME_H));
  const ox = Math.floor((canvas.width - FRAME_W * scale) / 2);
  const oy = Math.floor((canvas.height - FRAME_H * scale) / 2);
  ctx.save();
  if (flip) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
  paint(ctx, drawFrame(frame, a), ox, oy, scale);
  ctx.restore();
}

/** Register a player's sheet + animations in Phaser (once per look) */
export function ensureCharacterTextures(scene: Phaser.Scene, a: Appearance): string {
  const key = 'char-' + [a.skin, a.hair, a.hairColor, a.shirt, a.pants, a.shoes].join('-');
  if (scene.textures.exists(key)) return key;

  const tex = scene.textures.addCanvas(key, buildSheet(a))!;
  FRAMES.forEach((f, i) => tex.add(f, 0, i * FRAME_W, 0, FRAME_W, FRAME_H));

  const anim = (name: string, frames: FrameName[], frameRate: number, repeat = -1) =>
    scene.anims.create({ key: `${key}-${name}`, frames: frames.map((frame) => ({ key, frame })), frameRate, repeat });
  anim('idle', ['idle0', 'idle1'], 3);
  anim('run', ['run0', 'run1', 'run2', 'run3'], 11);
  anim('jump', ['jump'], 1);
  anim('fall', ['fall'], 1);
  anim('punch', ['punch'], 1);
  anim('kick', ['kick'], 1);
  anim('hurt', ['hurt'], 1);
  anim('dead', ['hurt'], 1);
  return key;
}
