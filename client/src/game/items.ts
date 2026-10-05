// ============================================================
//  Item + bomb pixel icons (drawn from text, no image files)
//  រូបវត្ថុ (heal, power, speed, bomb) គូរពីអក្សរ
// ============================================================
import Phaser from 'phaser';
import type { ItemKind } from '../../../shared/game.ts';

const COLORS: Record<string, string> = {
  o: '#140c1c', // outline
  r: '#ff4d6d', // red
  w: '#ffffff', // shine
  y: '#ffd23f', // yellow
  K: '#3a3550', // bomb body
  g: '#6f6890', // bomb shine
  s: '#ff9f43', // spark
  b: '#7a4520', // fuse
};

// each letter = one pixel ('.' = empty)
const ICONS: Record<ItemKind, string[]> = {
  heal: [
    '.oo...oo.',
    'orro.orro',
    'orwrorrro',
    'orrrrrrro',
    '.orrrrro.',
    '..orrro..',
    '...oro...',
    '....o....',
  ],
  power: [ // boxing glove
    '.ooooo...',
    'orrrrro..',
    'orwrrrro.',
    'orrrrrroo',
    'orrrrrrro',
    'orrrrrrro',
    '.orrrrro.',
    '.oyyyyo..',
    '.oooooo..',
  ],
  speed: [ // lightning bolt
    '....oooo',
    '...oyyo.',
    '..oyyo..',
    '.oyyyyoo',
    'ooooyyo.',
    '...oyo..',
    '..oyo...',
    '..oo....',
  ],
  bomb: [
    '......sy.',
    '.....b.s.',
    '...oob...',
    '..oKKKo..',
    '.oKgKKKo.',
    '.oKKKKKo.',
    '.oKKKKKo.',
    '..oKKKo..',
    '...ooo...',
  ],
};

export const ITEM_GLOW: Record<ItemKind, number> = {
  heal: 0xff4d6d, power: 0xff9f43, speed: 0xffd23f, bomb: 0xc77dff,
};

export const ITEM_LABEL: Record<ItemKind, string> = {
  heal: '+30 HP', power: 'POWER!', speed: 'SPEED!', bomb: 'BOMB! Punch to throw',
};

/** Create the 4 item textures once: keys item-heal, item-power, item-speed, item-bomb */
export function ensureItemTextures(scene: Phaser.Scene) {
  for (const [kind, rows] of Object.entries(ICONS)) {
    const key = `item-${kind}`;
    if (scene.textures.exists(key)) continue;
    const c = document.createElement('canvas');
    c.width = Math.max(...rows.map((r) => r.length));
    c.height = rows.length;
    const ctx = c.getContext('2d')!;
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.') return;
      ctx.fillStyle = COLORS[ch];
      ctx.fillRect(x, y, 1, 1);
    }));
    scene.textures.addCanvas(key, c);
  }
}