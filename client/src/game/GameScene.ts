// ============================================================
//  GameScene — draws the arena and every player from the
//  server state. The server decides everything; this scene
//  only shows it smoothly.  ផ្ទាំងហ្គេម — បង្ហាញអ្វីដែល server សម្រេច
//  V2: shield bubble, roll spin, dizzy stars, buff effects,
//      items, bombs, explosions
// ============================================================
import Phaser from 'phaser';
import type { Room } from 'colyseus.js';
import { drawStage } from './stage.ts';
import { ensureCharacterTextures, FEET_ORIGIN_Y, SPRITE_SCALE } from './sprites.ts';
import { ensureItemTextures, ITEM_GLOW, ITEM_LABEL } from './items.ts';
import { sanitizeAppearance, MAX_HP, SHIELD_MAX, BOMB_RADIUS, WORLD_W, ItemKind } from '../../../shared/game.ts';
import { sfx } from '../sound.ts';

export const SLOT_COLORS = ['#ff5a5f', '#4dc9ff', '#ffd23f', '#7bf08a', '#c77dff',
  '#ff9f43', '#ff7ac6', '#3df5d2', '#b0b8ff', '#f5f5f5'];
const slotColor = (slot: number) => Phaser.Display.Color.HexStringToColor(SLOT_COLORS[slot % SLOT_COLORS.length]).color;

/** tell the HTML UI to show a message (main.ts listens for this) */
export const uiToast = (msg: string) => window.dispatchEvent(new CustomEvent('pb-toast', { detail: msg }));

class PlayerView {
  sprite: Phaser.GameObjects.Sprite;
  tag: Phaser.GameObjects.Text;
  bar: Phaser.GameObjects.Graphics;
  fx: Phaser.GameObjects.Graphics;          // shield bubble, dizzy stars
  bombIcon: Phaser.GameObjects.Image;
  marker?: Phaser.GameObjects.Text;
  key = '';
  look = '';
  anim = '';
  ghostTimer = 0;

  constructor(scene: Phaser.Scene, public id: string, isMe: boolean) {
    this.sprite = scene.add.sprite(0, 0, '__DEFAULT').setOrigin(0.5, FEET_ORIGIN_Y).setScale(SPRITE_SCALE);
    this.tag = scene.add.text(0, 0, '', {
      fontFamily: '"Press Start 2P"', fontSize: '9px', color: '#fff',
      stroke: '#140c1c', strokeThickness: 3, resolution: 2,
    }).setOrigin(0.5, 1).setDepth(20);
    this.bar = scene.add.graphics().setDepth(20);
    this.fx = scene.add.graphics().setDepth(12);
    this.bombIcon = scene.add.image(0, 0, 'item-bomb').setScale(2).setDepth(21).setVisible(false);
    if (isMe) {
      this.marker = scene.add.text(0, 0, '▼', {
        fontFamily: 'monospace', fontSize: '14px', color: '#ffd23f', stroke: '#140c1c', strokeThickness: 3,
      }).setOrigin(0.5, 1).setDepth(21);
    }
    this.sprite.setDepth(isMe ? 11 : 10);
  }

  destroy() {
    this.sprite.destroy(); this.tag.destroy(); this.bar.destroy(); this.fx.destroy();
    this.bombIcon.destroy(); this.marker?.destroy();
  }
}

export class GameScene extends Phaser.Scene {
  private room!: Room;
  private views = new Map<string, PlayerView>();
  private itemViews = new Map<string, { img: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Arc }>();
  private bombViews = new Map<string, Phaser.GameObjects.Image>();

  constructor() { super('game'); }

  init(data: { room: Room }) {
    this.room = data.room;
    this.views = new Map();
    this.itemViews = new Map();
    this.bombViews = new Map();
  }

  create() {
    drawStage(this);
    ensureItemTextures(this);
    const me = () => this.room.sessionId;

    this.room.onMessage('hit', (h: { x: number; y: number; damage: number; target: string }) => {
      this.burst(h.x, h.y, 8, ['#ffffff', '#ffd23f', '#ff9f43'], 140);
      this.floatText(h.x, h.y - 10, `-${h.damage}`, '#ffd23f');
      this.cameras.main.shake(70, 0.004);
      sfx.hit();
      this.flash(h.target);
    });

    this.room.onMessage('block', (b: { x: number; y: number }) => {
      this.burst(b.x, b.y, 6, ['#ffffff', '#4dc9ff'], 110);
      sfx.block();
    });

    this.room.onMessage('shieldbreak', (b: { id: string; x: number; y: number }) => {
      this.burst(b.x, b.y, 20, ['#ffffff', '#4dc9ff', '#b0b8ff'], 260);
      this.floatText(b.x, b.y - 40, 'BREAK!', '#4dc9ff');
      this.cameras.main.shake(160, 0.008);
      sfx.shieldBreak();
    });

    this.room.onMessage('dodge', () => sfx.dodge());
    this.room.onMessage('throw', () => sfx.throw());

    this.room.onMessage('pickup', (p: { id: string; kind: ItemKind; x: number; y: number }) => {
      const color = '#' + ITEM_GLOW[p.kind].toString(16).padStart(6, '0');
      this.burst(p.x, p.y, 10, ['#ffffff', color], 120);
      if (p.id === me()) {
        this.floatText(p.x, p.y - 30, ITEM_LABEL[p.kind], color);
        sfx.pickup();
      }
    });

    this.room.onMessage('explode', (e: { x: number; y: number }) => {
      const ring = this.add.circle(e.x, e.y, 10, 0xffd23f, 0.6).setDepth(29);
      this.tweens.add({ targets: ring, radius: BOMB_RADIUS, alpha: 0, duration: 280, onComplete: () => ring.destroy() });
      this.burst(e.x, e.y, 30, ['#ffffff', '#ffd23f', '#ff9f43', '#ff4d6d', '#3a3550'], 360);
      this.cameras.main.shake(300, 0.016);
      sfx.explode();
    });

    this.room.onMessage('ko', (k: { id: string; x: number; y: number; name: string; by: string }) => {
      const x = Phaser.Math.Clamp(k.x, 20, WORLD_W - 20);
      const y = Phaser.Math.Clamp(k.y, 20, 520);
      this.burst(x, y, 26, ['#ffffff', '#ff5a5f', '#ffd23f', '#c77dff'], 320);
      this.cameras.main.shake(260, 0.012);
      sfx.ko();
      uiToast(k.by ? `💥 ${k.by} KO'd ${k.name}` : `💀 ${k.name} fell off`);
    });

    this.events.once('shutdown', () => {
      this.views.forEach((v) => v.destroy());
      this.views.clear();
    });
  }

  update(time: number, deltaMs: number) {
    const state = this.room.state as any;
    if (!state?.players) return;
    const dt = deltaMs / 1000;
    const k = 1 - Math.exp(-20 * dt); // smoothing factor (higher = snappier)

    this.updatePlayers(state, time, dt, k);
    this.updateItems(state, time);
    this.updateBombs(state, dt, k);
  }

  // ---------------------------------------------------------- players
  private updatePlayers(state: any, time: number, dt: number, k: number) {
    const seen = new Set<string>();

    state.players.forEach((p: any, id: string) => {
      seen.add(id);
      const isMe = id === this.room.sessionId;
      let v = this.views.get(id);
      if (!v) {
        v = new PlayerView(this, id, isMe);
        v.sprite.setPosition(p.x, p.y);
        this.views.set(id, v);
      }

      // appearance (re-build texture only if it changed)
      if (v.look !== p.look) {
        v.look = p.look;
        let look;
        try { look = sanitizeAppearance(JSON.parse(p.look)); } catch { look = sanitizeAppearance({}); }
        v.key = ensureCharacterTextures(this, look);
        v.sprite.setTexture(v.key, 'idle0');
        v.anim = '';
      }

      // smooth movement toward the server position
      const dx = p.x - v.sprite.x, dy = p.y - v.sprite.y;
      if (Math.abs(dx) > 220 || Math.abs(dy) > 220) v.sprite.setPosition(p.x, p.y); // teleport (respawn)
      else v.sprite.setPosition(v.sprite.x + dx * k, v.sprite.y + dy * k);

      v.sprite.setFlipX(p.facing < 0);
      if (p.anim !== v.anim) {
        if (isMe && (p.anim === 'punch' || p.anim === 'kick')) sfx.swing();
        if (p.anim === 'special') sfx.special();
        v.anim = p.anim;
        v.sprite.anims.play(`${v.key}-${p.anim}`, true);
      }

      // roll = spin around the body's middle
      const sx = v.sprite.x, sy = v.sprite.y;
      if (p.anim === 'roll') {
        v.sprite.setOrigin(0.5, 0.62);
        v.sprite.rotation += p.facing * 22 * dt;
      } else {
        v.sprite.setOrigin(0.5, FEET_ORIGIN_Y);
        v.sprite.rotation = 0;
      }

      const visible = p.anim !== 'dead';
      v.sprite.setVisible(visible);
      v.sprite.setAlpha(p.invuln ? 0.35 + 0.65 * Math.abs(Math.sin(time / 70)) : p.connected ? 1 : 0.4);

      // buffs: power = red flicker, speed / special = ghost trail
      if (p.buff === 'power' && visible) v.sprite.setTint(Math.sin(time / 80) > 0 ? 0xff8080 : 0xffffff);
      else if (!v.sprite.tintFill) v.sprite.clearTint();
      v.ghostTimer -= dt;
      if (visible && (p.buff === 'speed' || p.anim === 'special') && v.ghostTimer <= 0 && Math.abs(p.vx) > 50) {
        v.ghostTimer = 0.05;
        this.ghost(v, p.anim === 'special' ? 0xffd23f : 0x4dc9ff);
      }

      // shield bubble + dizzy stars
      v.fx.clear();
      if (visible && p.anim === 'block') {
        const r = 22 + 22 * (p.shield / SHIELD_MAX);
        v.fx.fillStyle(slotColor(p.slot), 0.18 + 0.12 * Math.sin(time / 90));
        v.fx.fillCircle(sx, sy - 36, r);
        v.fx.lineStyle(3, 0xffffff, 0.6);
        v.fx.strokeCircle(sx, sy - 36, r);
      }
      if (visible && p.anim === 'dizzy') {
        for (let i = 0; i < 3; i++) {
          const a = time / 180 + (i * Math.PI * 2) / 3;
          v.fx.fillStyle(0xffd23f, 1);
          v.fx.fillRect(Math.round(sx + Math.cos(a) * 18) - 3, Math.round(sy - 80 + Math.sin(a) * 5) - 3, 6, 6);
        }
      }

      // name tag + HP bar (+ shield bar when it's not full)
      v.tag.setText(p.name).setColor(SLOT_COLORS[p.slot % SLOT_COLORS.length]).setPosition(sx, sy - 88).setVisible(visible);
      v.marker?.setPosition(sx, sy - 102).setVisible(visible);
      v.bombIcon.setPosition(sx + v.tag.width / 2 + 14, sy - 94).setVisible(visible && p.hasBomb);
      v.bar.clear();
      if (visible) {
        const w = 40, h = 5, bx = Math.round(sx - w / 2), by = Math.round(sy - 84);
        const ratio = p.hp / MAX_HP;
        v.bar.fillStyle(0x140c1c).fillRect(bx - 1, by - 1, w + 2, h + 2);
        v.bar.fillStyle(0x3a2a4a).fillRect(bx, by, w, h);
        v.bar.fillStyle(ratio > 0.5 ? 0x7bf08a : ratio > 0.25 ? 0xffd23f : 0xff5a5f).fillRect(bx, by, Math.round(w * ratio), h);
        if (p.shield < SHIELD_MAX) {
          v.bar.fillStyle(0x140c1c).fillRect(bx - 1, by + h + 1, w + 2, 4);
          v.bar.fillStyle(0x4dc9ff).fillRect(bx, by + h + 2, Math.round(w * p.shield / SHIELD_MAX), 2);
        }
      }
    });

    for (const [id, v] of this.views) {
      if (!seen.has(id)) { v.destroy(); this.views.delete(id); }
    }
  }

  // ---------------------------------------------------------- items
  private updateItems(state: any, time: number) {
    const seen = new Set<string>();
    state.items?.forEach((it: any, id: string) => {
      seen.add(id);
      let v = this.itemViews.get(id);
      if (!v) {
        const glow = this.add.circle(it.x, it.y, 20, ITEM_GLOW[it.kind as ItemKind], 0.25).setDepth(8);
        const img = this.add.image(it.x, it.y, `item-${it.kind}`).setScale(3).setDepth(9);
        v = { img, glow };
        this.itemViews.set(id, v);
      }
      const bob = Math.sin(time / 250 + Number(id)) * 3;
      v.img.setPosition(it.x, it.y - 16 + bob);
      v.glow.setPosition(it.x, it.y - 16 + bob).setRadius(17 + Math.sin(time / 150) * 3);
    });
    for (const [id, v] of this.itemViews) {
      if (!seen.has(id)) { v.img.destroy(); v.glow.destroy(); this.itemViews.delete(id); }
    }
  }

  // ---------------------------------------------------------- bombs
  private updateBombs(state: any, dt: number, k: number) {
    const seen = new Set<string>();
    state.bombs?.forEach((b: any, id: string) => {
      seen.add(id);
      let img = this.bombViews.get(id);
      if (!img) {
        img = this.add.image(b.x, b.y, 'item-bomb').setScale(3).setDepth(15);
        this.bombViews.set(id, img);
      }
      img.setPosition(img.x + (b.x - img.x) * k, img.y + (b.y - img.y) * k);
      img.rotation += 10 * dt;
    });
    for (const [id, img] of this.bombViews) {
      if (!seen.has(id)) { img.destroy(); this.bombViews.delete(id); }
    }
  }

  // ---------------------------------------------------------- effects
  private flash(id: string) {
    const v = this.views.get(id);
    if (!v) return;
    v.sprite.setTintFill(0xffffff);
    this.time.delayedCall(70, () => v.sprite.clearTint());
  }

  private ghost(v: PlayerView, tint: number) {
    const g = this.add.image(v.sprite.x, v.sprite.y, v.sprite.texture.key, v.sprite.frame.name)
      .setOrigin(v.sprite.originX, v.sprite.originY).setScale(SPRITE_SCALE).setFlipX(v.sprite.flipX)
      .setRotation(v.sprite.rotation).setTintFill(tint).setAlpha(0.45).setDepth(9);
    this.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
  }

  private burst(x: number, y: number, count: number, colors: string[], speed: number) {
    for (let i = 0; i < count; i++) {
      const size = Phaser.Math.Between(1, 3) * 3;
      const col = Phaser.Display.Color.HexStringToColor(Phaser.Utils.Array.GetRandom(colors)).color;
      const r = this.add.rectangle(x, y, size, size, col).setDepth(30);
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.6);
      this.tweens.add({
        targets: r, x: x + Math.cos(a) * s * 0.4, y: y + Math.sin(a) * s * 0.4,
        alpha: 0, duration: 300 + Math.random() * 250, ease: 'Quad.easeOut',
        onComplete: () => r.destroy(),
      });
    }
  }

  private floatText(x: number, y: number, text: string, color: string) {
    const t = this.add.text(x, y, text, {
      fontFamily: '"Press Start 2P"', fontSize: '10px', color, stroke: '#140c1c', strokeThickness: 3, resolution: 2,
    }).setOrigin(0.5).setDepth(31);
    this.tweens.add({ targets: t, y: y - 30, alpha: 0, duration: 900, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
  }
}