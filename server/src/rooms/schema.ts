// ============================================================
//  Synced state — Colyseus sends changes of these fields to
//  every player automatically (only what changed, ~30x/sec).
//  ទិន្នន័យដែលត្រូវ sync ទៅអ្នកលេងគ្រប់គ្នា
// ============================================================
import { Schema, MapSchema, type } from '@colyseus/schema';
import { InputState, EMPTY_INPUT, AttackKind, ItemKind, SHIELD_MAX } from '../../../shared/game.ts';

export class Player extends Schema {
  @type('string') id = '';
  @type('string') name = '';
  @type('string') look = '';        // appearance as JSON
  @type('float32') x = 0;
  @type('float32') y = 0;
  @type('float32') vx = 0;
  @type('float32') vy = 0;
  @type('int8') facing = 1;         // 1 = right, -1 = left
  @type('string') anim = 'idle';
  @type('uint8') hp = 100;
  @type('uint8') lives = 3;
  @type('boolean') alive = true;    // still in the match
  @type('boolean') invuln = false;  // blinking after respawn / dodging
  @type('boolean') connected = true;
  @type('uint8') kos = 0;
  @type('uint8') slot = 0;          // color/spawn slot 0..9
  // ---- V2 ----
  @type('uint8') shield = SHIELD_MAX;   // 0..100
  @type('uint8') specialCd = 0;         // cooldown in tenths of a second (30 = 3.0s)
  @type('string') buff = '';            // '', 'power' or 'speed'
  @type('boolean') hasBomb = false;

  // ---- server-only fields (no @type → never sent to clients) ----
  userId = '';
  input: InputState = { ...EMPTY_INPUT };
  // button presses queued between ticks, so even a very fast tap is never lost
  pressed = { jump: false, punch: false, kick: false, down: false, block: false, special: false };
  onGround = false;
  jumpsLeft = 2;
  dropT = 0;            // falling through a one-way platform
  hitstunT = 0;
  dizzyT = 0;           // stunned after shield break
  invulnT = 0;
  respawnT = 0;
  rollT = 0;            // rolling / air-dodging
  rollCd = 0;
  airDodgeUsed = false;
  blocking = false;
  shieldF = SHIELD_MAX; // exact shield value (the synced `shield` is rounded)
  specialCdT = 0;
  buffT = 0;
  attack: { kind: AttackKind; t: number; hit: Set<string> } | null = null;
  lastHitBy = '';
  lastHitAt = 0;
}

export class Item extends Schema {
  @type('string') id = '';
  @type('string') kind: ItemKind = 'heal';
  @type('float32') x = 0;
  @type('float32') y = 0;
  vy = 0;
  life = 0;
}

export class Bomb extends Schema {
  @type('string') id = '';
  @type('float32') x = 0;
  @type('float32') y = 0;
  vx = 0;
  vy = 0;
  fuse = 0;
  owner = '';
}

export class GameState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Item }) items = new MapSchema<Item>();
  @type({ map: Bomb }) bombs = new MapSchema<Bomb>();
  @type('string') phase: 'waiting' | 'countdown' | 'playing' | 'ended' = 'waiting';
  @type('string') hostId = '';
  @type('uint8') countdown = 0;
  @type('string') winnerName = '';
  @type('string') roomName = '';
  @type('string') code = '';
  @type('uint8') maxPlayers = 8;
}