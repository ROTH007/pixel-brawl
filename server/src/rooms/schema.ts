// ============================================================
//  Synced state — Colyseus sends changes of these fields to
//  every player automatically (only what changed, ~30x/sec).
//  ទិន្នន័យដែលត្រូវ sync ទៅអ្នកលេងគ្រប់គ្នា
// ============================================================
import { Schema, MapSchema, type } from '@colyseus/schema';
import { InputState, EMPTY_INPUT } from '../../../shared/game.ts';

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
  @type('boolean') invuln = false;  // blinking after respawn
  @type('boolean') connected = true;
  @type('uint8') kos = 0;
  @type('uint8') slot = 0;          // color/spawn slot 0..9

  // ---- server-only fields (no @type → never sent to clients) ----
  userId = '';
  input: InputState = { ...EMPTY_INPUT };
  // button presses queued between ticks, so even a very fast tap is never lost
  pressed = { jump: false, punch: false, kick: false, down: false };
  onGround = false;
  jumpsLeft = 2;
  dropT = 0;            // falling through a one-way platform
  hitstunT = 0;
  invulnT = 0;
  respawnT = 0;
  attack: { kind: 'punch' | 'kick'; t: number; hit: Set<string> } | null = null;
  lastHitBy = '';
  lastHitAt = 0;
}

export class GameState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type('string') phase: 'waiting' | 'countdown' | 'playing' | 'ended' = 'waiting';
  @type('string') hostId = '';
  @type('uint8') countdown = 0;
  @type('string') winnerName = '';
  @type('string') roomName = '';
  @type('string') code = '';
  @type('uint8') maxPlayers = 8;
}
