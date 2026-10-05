// ============================================================
//  Shared game rules — used by BOTH the server and the client
//  ច្បាប់ហ្គេមរួម — ប្រើទាំង server និង client
// ============================================================

export const WORLD_W = 960;
export const WORLD_H = 540;

export const TICK_MS = 1000 / 60;   // server simulation: 60 times per second
export const PATCH_MS = 1000 / 30;  // state sent to clients: 30 times per second

// ---------- Physics ----------
export const GRAVITY = 2200;      // px/s²
export const MOVE_SPEED = 300;    // px/s
export const AIR_ACCEL = 1800;    // px/s² — air control
export const GROUND_FRICTION = 2400;
export const AIR_DRAG = 520;       // slows sideways flying in the air
export const JUMP_VELOCITY = 760; // px/s
export const MAX_JUMPS = 2;       // double jump
export const MAX_FALL = 1100;

// ---------- Player ----------
export const PLAYER_W = 36;       // hitbox width
export const PLAYER_H = 66;       // hitbox height
export const MAX_HP = 100;
export const START_LIVES = 3;
export const RESPAWN_INVULN = 1.5; // seconds of invincibility after respawn
export const HITSTUN = 0.28;       // seconds you can't act after being hit

// KO zone — leave this box and you lose a life
export const KO_LEFT = -180;
export const KO_RIGHT = WORLD_W + 180;
export const KO_BOTTOM = WORLD_H + 160;

// ---------- Attacks ----------
export interface AttackDef {
  startup: number;   // seconds before the hit becomes active
  active: number;    // seconds the hit can connect
  total: number;     // full move duration (seconds)
  damage: number;
  knockback: number; // base launch speed
  // hitbox relative to the player's feet, facing right
  box: { x: number; y: number; w: number; h: number };
}

export type AttackKind = 'punch' | 'kick' | 'special';

export const ATTACKS: Record<AttackKind, AttackDef> = {
  punch:   { startup: 0.06, active: 0.10, total: 0.28, damage: 8, knockback: 300,
             box: { x: 10, y: -58, w: 42, h: 24 } },
  kick:    { startup: 0.14, active: 0.12, total: 0.46, damage: 13, knockback: 430,
             box: { x: 10, y: -36, w: 52, h: 26 } },
  // Dash punch: rush forward and hit the first player you touch
  special: { startup: 0.08, active: 0.22, total: 0.42, damage: 14, knockback: 520,
             box: { x: 4, y: -60, w: 48, h: 44 } },
};

export const SPECIAL_COOLDOWN = 3;   // seconds between special moves
export const SPECIAL_DASH = 680;     // dash speed px/s

// ---------- Shield / block (ការពារ) ----------
export const SHIELD_MAX = 100;
export const SHIELD_DRAIN = 28;      // per second while holding block
export const SHIELD_REGEN = 14;      // per second when not blocking
export const SHIELD_HIT_MULT = 1.4;  // shield loses damage × this when hit
export const SHIELD_BREAK_STUN = 1.6; // seconds dizzy when the shield breaks

// ---------- Dodge (គេចខ្លួន) ----------
export const ROLL_TIME = 0.32;       // block + left/right on the ground
export const ROLL_SPEED = 470;
export const ROLL_COOLDOWN = 0.5;
export const AIR_DODGE_TIME = 0.3;   // block in the air (once per jump)

// ---------- Items (វត្ថុធ្លាក់) ----------
export const ITEM_KINDS = ['heal', 'power', 'speed', 'bomb'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
export const ITEM_SPAWN_EVERY = 11;  // seconds
export const MAX_ITEMS = 2;
export const ITEM_LIFETIME = 15;
export const ITEM_SIZE = 30;
export const HEAL_AMOUNT = 30;
export const POWER_TIME = 8;         // seconds of stronger hits
export const POWER_MULT = 1.5;
export const SPEED_TIME = 7;
export const SPEED_MULT = 1.45;

export const BOMB_FUSE = 2.2;        // explodes after this many seconds if it hits nothing
export const BOMB_RADIUS = 80;
export const BOMB_DAMAGE = 18;
export const BOMB_KNOCKBACK = 560;
export const BOMB_THROW_VX = 520;
export const BOMB_THROW_VY = -420;

// ---------- Map ----------
export interface Platform { x: number; y: number; w: number; h: number; oneWay: boolean }

export const PLATFORMS: Platform[] = [
  { x: 150, y: 430, w: 660, h: 60, oneWay: false }, // main stage
  { x: 230, y: 320, w: 150, h: 14, oneWay: true },
  { x: 580, y: 320, w: 150, h: 14, oneWay: true },
  { x: 405, y: 215, w: 150, h: 14, oneWay: true },
];

export const SPAWN_POINTS = [
  { x: 260, y: 300 }, { x: 700, y: 300 }, { x: 480, y: 190 }, { x: 350, y: 400 },
  { x: 610, y: 400 }, { x: 200, y: 400 }, { x: 760, y: 400 }, { x: 480, y: 400 },
  { x: 300, y: 300 }, { x: 660, y: 300 },
];

// ---------- Character appearance ----------
export const SKIN_TONES = ['#f6d3b3', '#e8b48f', '#c98e66', '#a0694a', '#7a4b33', '#4f3022'];
export const HAIR_STYLES = ['Short', 'Spiky', 'Long', 'Bun', 'Mohawk', 'Cap', 'Bald'];

export interface Appearance {
  skin: number;      // index into SKIN_TONES
  hair: number;      // index into HAIR_STYLES
  hairColor: string; // #rrggbb
  shirt: string;
  pants: string;
  shoes: string;
}

export const DEFAULT_APPEARANCE: Appearance = {
  skin: 1, hair: 1, hairColor: '#2b1d16', shirt: '#d94848', pants: '#2f3e8f', shoes: '#f2f2f2',
};

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Clean any appearance coming from a player — never trust the client */
export function sanitizeAppearance(a: any): Appearance {
  const d = DEFAULT_APPEARANCE;
  const int = (v: any, max: number, def: number) =>
    Number.isInteger(v) && v >= 0 && v < max ? v : def;
  const col = (v: any, def: string) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : def);
  return {
    skin: int(a?.skin, SKIN_TONES.length, d.skin),
    hair: int(a?.hair, HAIR_STYLES.length, d.hair),
    hairColor: col(a?.hairColor, d.hairColor),
    shirt: col(a?.shirt, d.shirt),
    pants: col(a?.pants, d.pants),
    shoes: col(a?.shoes, d.shoes),
  };
}

// ---------- Input ----------
export interface InputState {
  left: boolean; right: boolean; jump: boolean; down: boolean;
  punch: boolean; kick: boolean; block: boolean; special: boolean;
}

export const EMPTY_INPUT: InputState = {
  left: false, right: false, jump: false, down: false,
  punch: false, kick: false, block: false, special: false,
};

export type Anim = 'idle' | 'run' | 'jump' | 'fall' | 'punch' | 'kick' | 'special'
  | 'block' | 'roll' | 'hurt' | 'dizzy' | 'dead';