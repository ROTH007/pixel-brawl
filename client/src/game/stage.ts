// ============================================================
//  Arena art — background + platforms, drawn with code
//  ផ្ទៃខាងក្រោយ និងវេទិកា គូរដោយកូដ
// ============================================================
import Phaser from 'phaser';
import { WORLD_W, WORLD_H, PLATFORMS } from '../../../shared/game.ts';

const B = 3; // one "art pixel" = 3 screen pixels (same as the characters)

// small deterministic random, so the art looks the same every time
function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

function makeBackground(): HTMLCanvasElement {
  const W = WORLD_W / B, H = WORLD_H / B;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const r = rng(7);

  // sky bands (dusk → night)
  const bands = ['#120d2b', '#1a1240', '#261651', '#3a1b5c', '#5a2260', '#83305f', '#b0485a'];
  const bandH = Math.ceil(H * 0.72 / bands.length);
  bands.forEach((col, i) => {
    g.fillStyle = col;
    g.fillRect(0, i * bandH, W, bandH + 1);
    // dithered edge between bands
    if (i > 0) {
      g.fillStyle = bands[i - 1];
      for (let x = (i % 2); x < W; x += 2) g.fillRect(x, i * bandH, 1, 1);
    }
  });
  g.fillStyle = '#b0485a';
  g.fillRect(0, bandH * bands.length, W, H);

  // stars
  for (let i = 0; i < 70; i++) {
    g.fillStyle = r() > 0.8 ? '#ffe9a8' : '#cfc6ff';
    g.fillRect(Math.floor(r() * W), Math.floor(r() * H * 0.45), 1, 1);
  }

  // moon
  g.fillStyle = '#ffe9c4';
  g.beginPath(); g.arc(250, 34, 13, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f2cf9e';
  g.fillRect(244, 30, 3, 3); g.fillRect(254, 38, 4, 3); g.fillRect(249, 42, 2, 2);

  // two layers of mountains
  const mountains = (base: number, amp: number, color: string, seed: number) => {
    const rr = rng(seed);
    g.fillStyle = color;
    let h = base;
    for (let x = 0; x < W; x++) {
      h += (rr() - 0.5) * 3;
      h = Math.max(base - amp, Math.min(base + amp / 3, h));
      g.fillRect(x, Math.floor(h), 1, H);
    }
  };
  mountains(H * 0.62, 26, '#3b1f52', 11);
  mountains(H * 0.76, 18, '#26163d', 23);
  mountains(H * 0.9, 8, '#170f29', 31);
  return c;
}

function makePlatforms(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = WORLD_W; c.height = WORLD_H;
  const g = c.getContext('2d')!;
  const r = rng(99);
  const p = (x: number, y: number, col: string, w = 1, h = 1) => {
    g.fillStyle = col;
    g.fillRect(x, y, w * B, h * B);
  };

  for (const pl of PLATFORMS) {
    const cols = Math.round(pl.w / B);
    if (!pl.oneWay) {
      // ----- floating stone island -----
      const rows = Math.round(pl.h / B);
      for (let i = 0; i < cols; i++) {
        const x = pl.x + i * B;
        for (let j = 0; j < rows; j++) {
          const brick = ((j >> 2) % 2 === 0 ? i : i + 4) % 8 === 0 || j % 4 === 0;
          p(x, pl.y + j * B, brick ? '#3d2f4f' : (r() > 0.9 ? '#6b5a7d' : '#56456a'));
        }
        // grass on top
        p(x, pl.y, '#7be36b');
        p(x, pl.y + B, r() > 0.3 ? '#4cb05a' : '#7be36b');
        if (r() > 0.6) p(x, pl.y + 2 * B, '#2f7a45');
        if (r() > 0.85) p(x, pl.y - B, '#7be36b'); // grass tuft
      }
      // tapering rocky underside
      const depth = 26;
      for (let j = 0; j < depth; j++) {
        const inset = Math.floor((j * j) / 7 + r() * 2);
        const y = pl.y + pl.h + j * B;
        for (let i = inset; i < cols - inset; i++) {
          p(pl.x + i * B, y, (i + j) % 7 === 0 ? '#2a1f3a' : '#3d2f4f');
        }
      }
      // outline left/right edge
      g.fillStyle = '#140c1c';
      g.fillRect(pl.x - B, pl.y, B, pl.h);
      g.fillRect(pl.x + pl.w, pl.y, B, pl.h);
    } else {
      // ----- wooden one-way platform -----
      for (let i = 0; i < cols; i++) {
        const x = pl.x + i * B;
        p(x, pl.y, '#f0b35e');
        p(x, pl.y + B, i % 10 === 0 ? '#5a3418' : '#c47a35');
        p(x, pl.y + 2 * B, i % 10 === 0 ? '#5a3418' : '#9c5b27');
        p(x, pl.y + 3 * B, '#5a3418');
        if (i % 10 === 5) p(x, pl.y + B, '#e8e0d0'); // nail
      }
      // supports
      for (const sx of [pl.x + 6 * B, pl.x + pl.w - 8 * B]) {
        for (let j = 4; j < 9; j++) p(sx, pl.y + j * B, j % 2 ? '#7a4520' : '#5a3418', 2);
      }
    }
  }
  return c;
}

export function drawStage(scene: Phaser.Scene) {
  if (!scene.textures.exists('bg')) scene.textures.addCanvas('bg', makeBackground());
  if (!scene.textures.exists('platforms')) scene.textures.addCanvas('platforms', makePlatforms());
  scene.add.image(0, 0, 'bg').setOrigin(0).setScale(B).setDepth(-10);
  scene.add.image(0, 0, 'platforms').setOrigin(0).setDepth(-5);
}
