// ============================================================
//  Physics + combat simulation (runs ONLY on the server so
//  nobody can cheat). ការគណនារូបវិទ្យា និងការវាយ — នៅលើ server
//  V2: block, roll / air dodge, special dash punch, items, bombs
// ============================================================
import {
  GRAVITY, MOVE_SPEED, AIR_ACCEL, AIR_DRAG, GROUND_FRICTION, JUMP_VELOCITY, MAX_JUMPS, MAX_FALL,
  PLAYER_W, PLAYER_H, MAX_HP, HITSTUN, ATTACKS, PLATFORMS, WORLD_W,
  KO_LEFT, KO_RIGHT, KO_BOTTOM, Anim,
  SPECIAL_COOLDOWN, SPECIAL_DASH,
  SHIELD_MAX, SHIELD_DRAIN, SHIELD_REGEN, SHIELD_HIT_MULT, SHIELD_BREAK_STUN,
  ROLL_TIME, ROLL_SPEED, ROLL_COOLDOWN, AIR_DODGE_TIME,
  ITEM_KINDS, ITEM_LIFETIME, ITEM_SIZE, HEAL_AMOUNT, POWER_TIME, POWER_MULT, SPEED_TIME, SPEED_MULT,
  BOMB_FUSE, BOMB_RADIUS, BOMB_DAMAGE, BOMB_KNOCKBACK, BOMB_THROW_VX, BOMB_THROW_VY,
} from '../../../shared/game.ts';
import { Player, Item, Bomb } from './schema.ts';

/** The room passes this in so the simulation can send events (sounds/effects) to clients */
export type Emit = (type: string, data: unknown) => void;

function approach(v: number, target: number, amount: number) {
  return v < target ? Math.min(v + amount, target) : Math.max(v - amount, target);
}

function overlap(ax: number, ay: number, aw: number, ah: number,
                 bx: number, by: number, bw: number, bh: number) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

let nextId = 1;
const newId = () => String(nextId++);

// ------------------------------------------------------------------ player
/** Move one player for one tick. dt in seconds. Returns a bomb if they threw one. */
export function stepPlayer(p: Player, dt: number, emit: Emit): Bomb | null {
  const inp = p.input;
  const pr = p.pressed;
  p.pressed = { jump: false, punch: false, kick: false, down: false, block: false, special: false };
  let thrown: Bomb | null = null;

  // ----- timers -----
  p.hitstunT = Math.max(0, p.hitstunT - dt);
  p.dizzyT = Math.max(0, p.dizzyT - dt);
  p.invulnT = Math.max(0, p.invulnT - dt);
  p.dropT = Math.max(0, p.dropT - dt);
  p.rollCd = Math.max(0, p.rollCd - dt);
  p.specialCdT = Math.max(0, p.specialCdT - dt);
  p.specialCd = Math.ceil(p.specialCdT * 10);
  if (p.buffT > 0) {
    p.buffT -= dt;
    if (p.buffT <= 0) { p.buffT = 0; p.buff = ''; }
  }
  const wasRolling = p.rollT > 0;
  p.rollT = Math.max(0, p.rollT - dt);
  if (wasRolling && p.rollT === 0 && p.onGround) p.vx = 0; // roll finished
  p.invuln = p.invulnT > 0;

  const stunned = p.hitstunT > 0 || p.dizzyT > 0;
  let canAct = !stunned && !p.attack && p.rollT === 0;
  const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  const speed = MOVE_SPEED * (p.buff === 'speed' ? SPEED_MULT : 1);

  // ----- dodge: block + direction on ground = roll, block in air = air dodge -----
  if (canAct && pr.block) {
    if (p.onGround && dir !== 0 && p.rollCd <= 0) {
      p.rollT = ROLL_TIME;
      p.rollCd = ROLL_TIME + ROLL_COOLDOWN;
      p.vx = dir * ROLL_SPEED;
      p.invulnT = Math.max(p.invulnT, ROLL_TIME * 0.85);
      emit('dodge', { id: p.id });
    } else if (!p.onGround && !p.airDodgeUsed) {
      p.rollT = AIR_DODGE_TIME;
      p.airDodgeUsed = true;
      p.vx += dir * 160;
      p.vy *= 0.3;
      p.invulnT = Math.max(p.invulnT, AIR_DODGE_TIME);
      emit('dodge', { id: p.id });
    }
  }
  const rolling = p.rollT > 0;
  if (rolling) canAct = false; // a dodge that just started uses up this tick

  // ----- shield (hold block on the ground, not moving) -----
  p.blocking = canAct && p.rollT === 0 && p.onGround && inp.block && p.shieldF > 0;
  if (p.blocking) {
    p.shieldF -= SHIELD_DRAIN * dt;
    if (p.shieldF <= 0) breakShield(p, emit);
  } else {
    p.shieldF = Math.min(SHIELD_MAX, p.shieldF + SHIELD_REGEN * dt);
  }
  p.shield = Math.round(p.shieldF);

  // ----- horizontal movement -----
  const special = p.attack?.kind === 'special' ? p.attack : null;
  const dashing = special && special.t >= ATTACKS.special.startup &&
                  special.t <= ATTACKS.special.startup + ATTACKS.special.active;
  if (dashing) {
    p.vx = p.facing * SPECIAL_DASH;
  } else if (rolling) {
    // keep roll / air-dodge momentum
  } else if (stunned) {
    p.vx = approach(p.vx, 0, (p.onGround ? GROUND_FRICTION * 0.5 : AIR_DRAG * 0.6) * dt);
  } else if (p.attack || p.blocking) {
    p.vx = approach(p.vx, 0, (p.onGround ? GROUND_FRICTION : AIR_DRAG) * dt);
  } else if (p.onGround) {
    p.vx = dir !== 0 ? dir * speed : approach(p.vx, 0, GROUND_FRICTION * dt);
  } else if (dir !== 0) {
    p.vx = approach(p.vx, dir * speed, AIR_ACCEL * dt);
  } else {
    p.vx = approach(p.vx, 0, AIR_DRAG * dt);
  }
  if (canAct && dir !== 0 && !p.blocking) p.facing = dir;

  // ----- jump / drop through -----
  if (canAct && pr.down && p.onGround && standingOnOneWay(p)) {
    p.dropT = 0.25;
    p.onGround = false;
    p.blocking = false;
  } else if (canAct && pr.jump && p.jumpsLeft > 0) {
    p.vy = -JUMP_VELOCITY * (p.onGround ? 1 : 0.9);
    p.jumpsLeft--;
    p.onGround = false;
    p.blocking = false;
  }

  // ----- attacks (not while shielding) -----
  if (canAct && !p.blocking) {
    if (pr.punch && p.hasBomb) {
      p.hasBomb = false;
      thrown = new Bomb();
      thrown.id = newId();
      thrown.owner = p.id;
      thrown.x = p.x + p.facing * 20;
      thrown.y = p.y - PLAYER_H + 10;
      thrown.vx = p.facing * BOMB_THROW_VX + p.vx * 0.3;
      thrown.vy = BOMB_THROW_VY;
      thrown.fuse = BOMB_FUSE;
      emit('throw', { id: p.id });
    } else if (pr.special && p.specialCdT <= 0) {
      p.attack = { kind: 'special', t: 0, hit: new Set() };
      p.specialCdT = SPECIAL_COOLDOWN;
    } else if (pr.punch || pr.kick) {
      p.attack = { kind: pr.punch ? 'punch' : 'kick', t: 0, hit: new Set() };
    }
  }

  // ----- gravity (none while dashing; fast-fall when holding down) -----
  if (!dashing) {
    p.vy += GRAVITY * dt * (inp.down && p.vy > 0 && !p.onGround ? 1.6 : 1);
    p.vy = Math.min(p.vy, MAX_FALL);
  } else {
    p.vy = 0;
  }

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
      p.airDodgeUsed = false;
    } else if (!pl.oneWay && p.vy < 0) {
      const head = p.y - PLAYER_H, bottom = pl.y + pl.h;
      if (head < bottom && prevBottom - PLAYER_H >= bottom) {
        p.y = bottom + PLAYER_H;
        p.vy = 0;
      }
    }
  }
  return thrown;
}

function breakShield(p: Player, emit: Emit) {
  p.shieldF = 30;
  p.shield = 30;
  p.blocking = false;
  p.dizzyT = SHIELD_BREAK_STUN;
  p.attack = null;
  p.vy = -380; // pops up like in Smash
  p.onGround = false;
  emit('shieldbreak', { id: p.id, x: p.x, y: p.y - PLAYER_H / 2 });
}

function standingOnOneWay(p: Player) {
  return PLATFORMS.some((pl) => pl.oneWay && Math.abs(p.y - pl.y) < 1 &&
    p.x + PLAYER_W / 2 > pl.x && p.x - PLAYER_W / 2 < pl.x + pl.w);
}

/** Apply a hit (from an attack or a bomb). Returns true if it was blocked. */
function applyHit(o: Player, from: Player | undefined, damage: number, knockback: number,
                  dirX: number, now: number, emit: Emit, hx: number, hy: number): boolean {
  if (o.blocking) {
    o.shieldF -= damage * SHIELD_HIT_MULT;
    o.vx = dirX * 140;
    emit('block', { x: hx, y: hy, target: o.id });
    if (o.shieldF <= 0) breakShield(o, emit);
    o.shield = Math.max(0, Math.round(o.shieldF));
    return true;
  }
  o.hp = Math.max(0, o.hp - damage);
  // the more damage you have taken, the further you fly (Smash style)
  const scale = 1 + (MAX_HP - o.hp) / 70;
  o.vx = dirX * knockback * 0.8 * scale;
  o.vy = -(knockback * 0.5 * scale + 120);
  o.onGround = false;
  o.hitstunT = HITSTUN * (0.8 + scale * 0.3);
  o.attack = null;
  o.rollT = 0;
  o.blocking = false;
  if (dirX !== 0) o.facing = -dirX;
  if (from && from !== o) { o.lastHitBy = from.id; o.lastHitAt = now; }
  emit('hit', { x: hx, y: hy, damage, target: o.id });
  return false;
}

/** Advance this player's attack and hit anyone in range */
export function stepAttack(p: Player, others: Player[], dt: number, now: number, emit: Emit) {
  if (!p.attack) return;
  const a = p.attack;
  const def = ATTACKS[a.kind];
  a.t += dt;

  if (a.t >= def.startup && a.t <= def.startup + def.active) {
    const bx = p.facing === 1 ? p.x + def.box.x : p.x - def.box.x - def.box.w;
    const by = p.y + def.box.y;
    const power = p.buff === 'power' ? POWER_MULT : 1;
    for (const o of others) {
      if (o === p || a.hit.has(o.id) || o.respawnT > 0 || !o.alive || o.invulnT > 0) continue;
      if (!overlap(bx, by, def.box.w, def.box.h, o.x - PLAYER_W / 2, o.y - PLAYER_H, PLAYER_W, PLAYER_H)) continue;
      a.hit.add(o.id);
      applyHit(o, p, Math.round(def.damage * power), def.knockback * power, p.facing, now, emit,
        bx + def.box.w / 2, by + def.box.h / 2);
      if (a.kind === 'special') {
        // the dash stops when it connects
        a.t = def.startup + def.active + 0.001;
        p.vx = p.facing * 80;
      }
    }
  }
  if (a.t >= def.total) p.attack = null;
}

export function isOutOfBounds(p: Player) {
  return p.x < KO_LEFT || p.x > KO_RIGHT || p.y > KO_BOTTOM;
}

export function pickAnim(p: Player): Anim {
  if (p.respawnT > 0 || !p.alive) return 'dead';
  if (p.dizzyT > 0) return 'dizzy';
  if (p.hitstunT > 0) return 'hurt';
  if (p.rollT > 0) return 'roll';
  if (p.attack) return p.attack.kind;
  if (p.blocking) return 'block';
  if (p.onGround) return Math.abs(p.vx) > 20 ? 'run' : 'idle';
  return p.vy < 0 ? 'jump' : 'fall';
}

/** reset V2 state on spawn / respawn */
export function resetCombatState(p: Player) {
  p.shieldF = SHIELD_MAX;
  p.shield = SHIELD_MAX;
  p.blocking = false;
  p.dizzyT = 0;
  p.rollT = 0;
  p.rollCd = 0;
  p.airDodgeUsed = false;
  p.specialCdT = 0;
  p.specialCd = 0;
  p.buff = '';
  p.buffT = 0;
  p.hasBomb = false;
}

// ------------------------------------------------------------------ items
export function spawnItem(): Item {
  const it = new Item();
  it.id = newId();
  it.kind = ITEM_KINDS[Math.floor(Math.random() * ITEM_KINDS.length)];
  const pl = PLATFORMS[Math.floor(Math.random() * PLATFORMS.length)];
  it.x = pl.x + 25 + Math.random() * (pl.w - 50);
  it.y = -20;
  it.vy = 170; // floats down slowly
  it.life = ITEM_LIFETIME;
  return it;
}

/** Move items, let players pick them up. Returns ids of items to remove. */
export function stepItems(items: Item[], players: Player[], dt: number, emit: Emit): string[] {
  const remove: string[] = [];
  for (const it of items) {
    it.life -= dt;
    if (it.life <= 0) { remove.push(it.id); continue; }

    if (it.vy > 0) {
      const prev = it.y;
      it.y += it.vy * dt;
      for (const pl of PLATFORMS) {
        if (it.x > pl.x && it.x < pl.x + pl.w && prev <= pl.y && it.y >= pl.y) { it.y = pl.y; it.vy = 0; }
      }
      if (it.y > KO_BOTTOM) { remove.push(it.id); continue; }
    }

    for (const p of players) {
      if (!p.alive || p.respawnT > 0) continue;
      if (it.kind === 'bomb' && p.hasBomb) continue;
      const hit = overlap(p.x - PLAYER_W / 2, p.y - PLAYER_H, PLAYER_W, PLAYER_H,
        it.x - ITEM_SIZE / 2, it.y - ITEM_SIZE, ITEM_SIZE, ITEM_SIZE);
      if (!hit) continue;
      if (it.kind === 'heal') p.hp = Math.min(MAX_HP, p.hp + HEAL_AMOUNT);
      if (it.kind === 'power') { p.buff = 'power'; p.buffT = POWER_TIME; }
      if (it.kind === 'speed') { p.buff = 'speed'; p.buffT = SPEED_TIME; }
      if (it.kind === 'bomb') p.hasBomb = true;
      emit('pickup', { id: p.id, kind: it.kind, x: it.x, y: it.y - ITEM_SIZE / 2 });
      remove.push(it.id);
      break;
    }
  }
  return remove;
}

// ------------------------------------------------------------------ bombs
/** Move bombs, explode on contact/landing/timeout. Returns ids of bombs to remove. */
export function stepBombs(bombs: Bomb[], players: Player[], dt: number, now: number, emit: Emit): string[] {
  const remove: string[] = [];
  for (const b of bombs) {
    b.fuse -= dt;
    b.vy = Math.min(b.vy + GRAVITY * 0.8 * dt, MAX_FALL);
    const prevY = b.y;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    let boom = b.fuse <= 0;
    for (const pl of PLATFORMS) {
      if (b.x > pl.x && b.x < pl.x + pl.w && prevY <= pl.y && b.y >= pl.y) boom = true;
    }
    for (const p of players) {
      if (boom) break;
      if (!p.alive || p.respawnT > 0 || p.invulnT > 0) continue;
      if (p.id === b.owner && BOMB_FUSE - b.fuse < 0.25) continue; // don't hit yourself right away
      if (overlap(p.x - PLAYER_W / 2, p.y - PLAYER_H, PLAYER_W, PLAYER_H, b.x - 8, b.y - 8, 16, 16)) boom = true;
    }
    if (b.y > KO_BOTTOM || b.x < KO_LEFT || b.x > WORLD_W - KO_LEFT) { remove.push(b.id); continue; }

    if (boom) {
      remove.push(b.id);
      emit('explode', { x: b.x, y: b.y });
      const owner = players.find((p) => p.id === b.owner);
      for (const p of players) {
        if (!p.alive || p.respawnT > 0 || p.invulnT > 0) continue;
        const dx = p.x - b.x, dy = (p.y - PLAYER_H / 2) - b.y;
        if (Math.hypot(dx, dy) > BOMB_RADIUS) continue;
        applyHit(p, owner, BOMB_DAMAGE, BOMB_KNOCKBACK, dx >= 0 ? 1 : -1, now, emit, p.x, p.y - PLAYER_H / 2);
      }
    }
  }
  return remove;
}