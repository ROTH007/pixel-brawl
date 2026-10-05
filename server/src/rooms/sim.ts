// ============================================================
//  Physics + combat simulation (runs ONLY on the server so
//  nobody can cheat). ការគណនារូបវិទ្យា និងការវាយ — នៅលើ server
// ============================================================
import {
  GRAVITY, MOVE_SPEED, AIR_ACCEL, AIR_DRAG, GROUND_FRICTION, JUMP_VELOCITY, MAX_JUMPS, MAX_FALL,
  PLAYER_W, PLAYER_H, MAX_HP, HITSTUN, ATTACKS, PLATFORMS,
  KO_LEFT, KO_RIGHT, KO_BOTTOM, Anim,
} from '../../../shared/game.ts';
import type { Player } from './schema.ts';

export interface HitEvent { x: number; y: number; damage: number; target: string }

function approach(v: number, target: number, amount: number) {
  return v < target ? Math.min(v + amount, target) : Math.max(v - amount, target);
}

function overlap(ax: number, ay: number, aw: number, ah: number,
                 bx: number, by: number, bw: number, bh: number) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/** Move one player for one tick. dt in seconds. */
export function stepPlayer(p: Player, dt: number) {
  const inp = p.input;
  const { jump: jumpPressed, punch: punchPressed, kick: kickPressed, down: downPressed } = p.pressed;
  p.pressed = { jump: false, punch: false, kick: false, down: false };

  // timers
  p.hitstunT = Math.max(0, p.hitstunT - dt);
  p.invulnT = Math.max(0, p.invulnT - dt);
  p.dropT = Math.max(0, p.dropT - dt);
  p.invuln = p.invulnT > 0;

  const canAct = p.hitstunT <= 0 && !p.attack;
  const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);

  // ----- horizontal movement -----
  if (p.hitstunT > 0) {
    p.vx = approach(p.vx, 0, (p.onGround ? GROUND_FRICTION * 0.5 : AIR_DRAG * 0.6) * dt);
  } else if (p.attack) {
    p.vx = approach(p.vx, 0, (p.onGround ? GROUND_FRICTION : AIR_DRAG) * dt);
  } else if (p.onGround) {
    p.vx = dir !== 0 ? dir * MOVE_SPEED : approach(p.vx, 0, GROUND_FRICTION * dt);
  } else if (dir !== 0) {
    p.vx = approach(p.vx, dir * MOVE_SPEED, AIR_ACCEL * dt);
  } else {
    p.vx = approach(p.vx, 0, AIR_DRAG * dt);
  }
  if (canAct && dir !== 0) p.facing = dir;

  // ----- jump / drop through / attack -----
  if (canAct && downPressed && p.onGround && standingOnOneWay(p)) {
    p.dropT = 0.25;
    p.onGround = false;
  } else if (canAct && jumpPressed && p.jumpsLeft > 0) {
    p.vy = -JUMP_VELOCITY * (p.onGround ? 1 : 0.9);
    p.jumpsLeft--;
    p.onGround = false;
  }
  if (canAct && (punchPressed || kickPressed)) {
    p.attack = { kind: punchPressed ? 'punch' : 'kick', t: 0, hit: new Set() };
  }

  // ----- gravity (fast-fall when holding down) -----
  p.vy += GRAVITY * dt * (inp.down && p.vy > 0 && !p.onGround ? 1.6 : 1);
  p.vy = Math.min(p.vy, MAX_FALL);

  // ----- move X, block against solid platform sides -----
  p.x += p.vx * dt;
  for (const pl of PLATFORMS) {
    if (pl.oneWay) continue;
    if (overlap(p.x - PLAYER_W / 2, p.y - PLAYER_H, PLAYER_W, PLAYER_H - 2, pl.x, pl.y, pl.w, pl.h)) {
      p.x = p.vx > 0 ? pl.x - PLAYER_W / 2 : pl.x + pl.w + PLAYER_W / 2;
      p.vx = 0;
    }
  }

  // ----- move Y, land on platforms -----
  const prevBottom = p.y;
  p.y += p.vy * dt;
  p.onGround = false;
  for (const pl of PLATFORMS) {
    const xHit = p.x + PLAYER_W / 2 > pl.x && p.x - PLAYER_W / 2 < pl.x + pl.w;
    if (!xHit) continue;
    if (p.vy >= 0 && prevBottom <= pl.y + 0.5 && p.y >= pl.y && !(pl.oneWay && p.dropT > 0)) {
      p.y = pl.y;
      p.vy = 0;
      p.onGround = true;
      p.jumpsLeft = MAX_JUMPS;
    } else if (!pl.oneWay && p.vy < 0) {
      const head = p.y - PLAYER_H, bottom = pl.y + pl.h;
      if (head < bottom && prevBottom - PLAYER_H >= bottom) {
        p.y = bottom + PLAYER_H;
        p.vy = 0;
      }
    }
  }
}

function standingOnOneWay(p: Player) {
  return PLATFORMS.some((pl) => pl.oneWay && Math.abs(p.y - pl.y) < 1 &&
    p.x + PLAYER_W / 2 > pl.x && p.x - PLAYER_W / 2 < pl.x + pl.w);
}

/** Advance this player's attack and hit anyone in range */
export function stepAttack(p: Player, others: Player[], dt: number, now: number): HitEvent[] {
  const events: HitEvent[] = [];
  if (!p.attack) return events;
  const a = p.attack;
  const def = ATTACKS[a.kind];
  a.t += dt;

  if (a.t >= def.startup && a.t <= def.startup + def.active) {
    const bx = p.facing === 1 ? p.x + def.box.x : p.x - def.box.x - def.box.w;
    const by = p.y + def.box.y;
    for (const o of others) {
      if (o === p || a.hit.has(o.id) || o.respawnT > 0 || !o.alive || o.invulnT > 0) continue;
      if (!overlap(bx, by, def.box.w, def.box.h, o.x - PLAYER_W / 2, o.y - PLAYER_H, PLAYER_W, PLAYER_H)) continue;

      a.hit.add(o.id);
      o.hp = Math.max(0, o.hp - def.damage);
      // the more damage you have taken, the further you fly (Smash style)
      const scale = 1 + (MAX_HP - o.hp) / 70;
      o.vx = p.facing * def.knockback * 0.8 * scale;
      o.vy = -(def.knockback * 0.5 * scale + 120);
      o.onGround = false;
      o.hitstunT = HITSTUN * (0.8 + scale * 0.3);
      o.attack = null;
      o.facing = -p.facing;
      o.lastHitBy = p.id;
      o.lastHitAt = now;
      events.push({ x: bx + def.box.w / 2, y: by + def.box.h / 2, damage: def.damage, target: o.id });
    }
  }
  if (a.t >= def.total) p.attack = null;
  return events;
}

export function isOutOfBounds(p: Player) {
  return p.x < KO_LEFT || p.x > KO_RIGHT || p.y > KO_BOTTOM;
}

export function pickAnim(p: Player): Anim {
  if (p.respawnT > 0 || !p.alive) return 'dead';
  if (p.hitstunT > 0) return 'hurt';
  if (p.attack) return p.attack.kind;
  if (p.onGround) return Math.abs(p.vx) > 20 ? 'run' : 'idle';
  return p.vy < 0 ? 'jump' : 'fall';
}
