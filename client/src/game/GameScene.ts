// ============================================================
//  GameScene — draws the arena and every player from the
//  server state. The server decides everything; this scene
//  only shows it smoothly.  ផ្ទាំងហ្គេម — បង្ហាញអ្វីដែល server សម្រេច
// ============================================================
import Phaser from 'phaser';
import type { Room } from 'colyseus.js';
import { drawStage } from './stage.ts';
import { ensureCharacterTextures, FEET_ORIGIN_Y, SPRITE_SCALE } from './sprites.ts';
import { sanitizeAppearance, MAX_HP, WORLD_W } from '../../../shared/game.ts';
import { sfx } from '../sound.ts';

export const SLOT_COLORS = ['#ff5a5f', '#4dc9ff', '#ffd23f', '#7bf08a', '#c77dff',
  '#ff9f43', '#ff7ac6', '#3df5d2', '#b0b8ff', '#f5f5f5'];

class PlayerView {
  sprite: Phaser.GameObjects.Sprite;
  tag: Phaser.GameObjects.Text;
  bar: Phaser.GameObjects.Graphics;
  marker?: Phaser.GameObjects.Text;
  key = '';
  look = '';
  anim = '';
  hp = MAX_HP;

  constructor(scene: Phaser.Scene, public id: string, isMe: boolean) {
    this.sprite = scene.add.sprite(0, 0, '__DEFAULT').setOrigin(0.5, FEET_ORIGIN_Y).setScale(SPRITE_SCALE);
    this.tag = scene.add.text(0, 0, '', {
      fontFamily: '"Press Start 2P"', fontSize: '9px', color: '#fff',
      stroke: '#140c1c', strokeThickness: 3, resolution: 2,
    }).setOrigin(0.5, 1).setDepth(20);
    this.bar = scene.add.graphics().setDepth(20);
    if (isMe) {
      this.marker = scene.add.text(0, 0, '▼', {
        fontFamily: 'monospace', fontSize: '14px', color: '#ffd23f', stroke: '#140c1c', strokeThickness: 3,
      }).setOrigin(0.5, 1).setDepth(21);
    }
    this.sprite.setDepth(isMe ? 11 : 10);
  }

  destroy() {
    this.sprite.destroy(); this.tag.destroy(); this.bar.destroy(); this.marker?.destroy();
  }
}

export class GameScene extends Phaser.Scene {
  private room!: Room;
  private views = new Map<string, PlayerView>();

  constructor() { super('game'); }

  init(data: { room: Room }) {
    this.room = data.room;
    this.views = new Map();
  }

  create() {
    drawStage(this);

    this.room.onMessage('hit', (h: { x: number; y: number; damage: number; target: string }) => {
      this.burst(h.x, h.y, 8, ['#ffffff', '#ffd23f', '#ff9f43'], 140);
      this.floatText(h.x, h.y - 10, `-${h.damage}`, '#ffd23f');
      this.cameras.main.shake(70, 0.004);
      sfx.hit();
      const v = this.views.get(h.target);
      if (v) { v.sprite.setTintFill(0xffffff); this.time.delayedCall(70, () => v.sprite.clearTint()); }
    });

    this.room.onMessage('ko', (k: { id: string; x: number; y: number }) => {
      const x = Phaser.Math.Clamp(k.x, 20, WORLD_W - 20);
      const y = Phaser.Math.Clamp(k.y, 20, 520);
      this.burst(x, y, 26, ['#ffffff', '#ff5a5f', '#ffd23f', '#c77dff'], 320);
      this.cameras.main.shake(260, 0.012);
      sfx.ko();
    });

    this.events.once('shutdown', () => {
      this.views.forEach((v) => v.destroy());
      this.views.clear();
    });
  }

  update(_time: number, deltaMs: number) {
    const state = this.room.state as any;
    if (!state?.players) return;
    const dt = deltaMs / 1000;
    const k = 1 - Math.exp(-20 * dt); // smoothing factor (higher = snappier)
    const seen = new Set<string>();

    state.players.forEach((p: any, id: string) => {
      seen.add(id);
      let v = this.views.get(id);
      if (!v) {
        v = new PlayerView(this, id, id === this.room.sessionId);
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
        if ((p.anim === 'punch' || p.anim === 'kick') && id === this.room.sessionId) sfx.swing();
        v.anim = p.anim;
        v.sprite.anims.play(`${v.key}-${p.anim}`, true);
      }

      const visible = p.anim !== 'dead';
      v.sprite.setVisible(visible);
      v.sprite.setAlpha(p.invuln ? 0.35 + 0.65 * Math.abs(Math.sin(this.time.now / 70)) : p.connected ? 1 : 0.4);

      // name tag + HP bar above the head
      const sx = v.sprite.x, sy = v.sprite.y;
      v.tag.setText(p.name).setColor(SLOT_COLORS[p.slot % SLOT_COLORS.length]).setPosition(sx, sy - 86).setVisible(visible);
      v.marker?.setPosition(sx, sy - 100).setVisible(visible);
      v.bar.clear();
      if (visible) {
        const w = 40, h = 5, bx = Math.round(sx - w / 2), by = Math.round(sy - 82);
        const ratio = p.hp / MAX_HP;
        v.bar.fillStyle(0x140c1c).fillRect(bx - 1, by - 1, w + 2, h + 2);
        v.bar.fillStyle(0x3a2a4a).fillRect(bx, by, w, h);
        v.bar.fillStyle(ratio > 0.5 ? 0x7bf08a : ratio > 0.25 ? 0xffd23f : 0xff5a5f).fillRect(bx, by, Math.round(w * ratio), h);
      }
      v.hp = p.hp;
    });

    for (const [id, v] of this.views) {
      if (!seen.has(id)) { v.destroy(); this.views.delete(id); }
    }
  }

  // ---------- effects ----------
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
    this.tweens.add({ targets: t, y: y - 30, alpha: 0, duration: 650, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
  }
}
