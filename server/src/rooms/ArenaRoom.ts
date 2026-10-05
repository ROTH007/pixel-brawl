// ============================================================
//  ArenaRoom — one lobby / match.  បន្ទប់មួយ = lobby មួយ
//  Flow: waiting (free practice) → countdown → playing → ended → waiting
// ============================================================
import { Room, Client, matchMaker } from '@colyseus/core';
import { GameState, Player } from './schema.ts';
import { stepPlayer, stepAttack, isOutOfBounds, pickAnim } from './sim.ts';
import { verifyToken } from '../auth.ts';
import { db, User } from '../db.ts';
import {
  TICK_MS, PATCH_MS, MAX_HP, START_LIVES, RESPAWN_INVULN, SPAWN_POINTS, InputState,
} from '../../../shared/game.ts';

interface CreateOptions { token: string; roomName?: string; maxPlayers?: number; isPrivate?: boolean }

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion

async function uniqueCode() {
  for (;;) {
    let code = '';
    for (let i = 0; i < 5; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    const existing = await matchMaker.query({ roomId: code });
    if (existing.length === 0) return code;
  }
}

export class ArenaRoom extends Room<GameState> {
  state = new GameState();
  private elapsed = 0;
  private matchStartedWith = 0;

  async onCreate(options: CreateOptions) {
    this.roomId = await uniqueCode();
    const max = Math.min(10, Math.max(2, Math.floor(Number(options.maxPlayers) || 8)));
    this.maxClients = max;
    this.state.maxPlayers = max;
    this.state.code = this.roomId;
    this.state.roomName = String(options.roomName || 'Arena').slice(0, 24).trim() || 'Arena';
    if (options.isPrivate) await this.setPrivate(true);
    this.patchRate = PATCH_MS;
    this.updateMeta();

    this.onMessage('input', (client, input: Partial<InputState>) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const next: InputState = {
        left: !!input?.left, right: !!input?.right, jump: !!input?.jump,
        down: !!input?.down, punch: !!input?.punch, kick: !!input?.kick,
      };
      // remember new presses (false → true) until the next tick uses them
      if (next.jump && !p.input.jump) p.pressed.jump = true;
      if (next.punch && !p.input.punch) p.pressed.punch = true;
      if (next.kick && !p.input.kick) p.pressed.kick = true;
      if (next.down && !p.input.down) p.pressed.down = true;
      p.input = next;
    });

    this.onMessage('start', (client) => {
      if (client.sessionId !== this.state.hostId || this.state.phase !== 'waiting') return;
      if (this.connectedPlayers().length < 2) {
        client.send('toast', 'Need at least 2 players to start.');
        return;
      }
      this.startCountdown();
    });

    this.setSimulationInterval((dtMs) => this.update(dtMs / 1000), TICK_MS);
  }

  // Runs before onJoin: check the login token, load the user from the DB
  async onAuth(_client: Client, options: { token?: string }) {
    const id = verifyToken(options?.token);
    const user = id ? db.findById(id) : undefined;
    if (!user) throw new Error('Please log in again.');
    for (const p of this.state.players.values()) {
      if (p.userId === user.id) throw new Error('You are already in this room.');
    }
    return user;
  }

  onJoin(client: Client, _options: unknown, user: User) {
    const p = new Player();
    p.id = client.sessionId;
    p.userId = user.id;
    p.name = user.username;
    p.look = JSON.stringify(user.appearance);
    p.slot = this.freeSlot();
    this.spawn(p);
    this.state.players.set(client.sessionId, p);
    if (!this.state.hostId) this.state.hostId = client.sessionId;
    this.broadcast('toast', `${p.name} joined`, { except: client });
    this.updateMeta();
  }

  async onLeave(client: Client, consented: boolean) {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    p.connected = false;
    p.input = { left: false, right: false, jump: false, down: false, punch: false, kick: false };

    if (!consented) {
      try {
        // give them 15 seconds to come back (e.g. Wi-Fi drop)
        await this.allowReconnection(client, 15);
        p.connected = true;
        return;
      } catch { /* did not come back */ }
    }
    this.state.players.delete(client.sessionId);
    this.broadcast('toast', `${p.name} left`);
    if (this.state.hostId === client.sessionId) {
      const next = this.connectedPlayers()[0];
      this.state.hostId = next ? next.id : '';
      if (next) this.broadcast('toast', `${next.name} is now the host`);
    }
    this.updateMeta();
  }

  // ---------------------------------------------------------- game loop
  private update(dt: number) {
    dt = Math.min(dt, 0.05);
    this.elapsed += dt;
    const players = [...this.state.players.values()];
    const now = this.clock.currentTime;

    for (const p of players) {
      if (!p.alive) { p.anim = 'dead'; continue; }
      if (p.respawnT > 0) {
        p.respawnT -= dt;
        if (p.respawnT <= 0) this.spawn(p, true);
        p.anim = pickAnim(p);
        continue;
      }
      stepPlayer(p, dt);
    }

    const canFight = this.state.phase === 'waiting' || this.state.phase === 'playing';
    for (const p of players) {
      if (!p.alive || p.respawnT > 0) continue;
      if (canFight) {
        for (const h of stepAttack(p, players, dt, now)) this.broadcast('hit', h);
      } else {
        p.attack = null;
      }
    }

    for (const p of players) {
      if (p.alive && p.respawnT <= 0 && (p.hp <= 0 || isOutOfBounds(p))) this.knockOut(p, now);
      p.anim = pickAnim(p);
    }

    if (this.state.phase === 'playing') this.checkWinner();
  }

  private knockOut(p: Player, now: number) {
    const killer = p.lastHitBy && now - p.lastHitAt < 6000 ? this.state.players.get(p.lastHitBy) : undefined;
    const ranked = this.state.phase === 'playing';
    if (killer && killer !== p && ranked) killer.kos++;
    this.broadcast('ko', { id: p.id, x: p.x, y: p.y, by: killer?.name ?? '' });

    p.attack = null;
    p.vx = p.vy = 0;
    if (ranked) p.lives = Math.max(0, p.lives - 1);
    if (ranked && p.lives === 0) {
      p.alive = false;
    } else {
      p.respawnT = 1.2;
    }
  }

  private checkWinner() {
    const alive = [...this.state.players.values()].filter((p) => p.alive && p.connected);
    if (alive.length > 1) return;
    const winner = alive[0];
    this.state.phase = 'ended';
    this.state.winnerName = winner ? winner.name : 'Nobody';
    this.saveStats(winner);
    this.updateMeta();
    this.clock.setTimeout(() => this.backToLobby(), 7000);
  }

  private saveStats(winner?: Player) {
    for (const p of this.state.players.values()) {
      const u = db.findById(p.userId);
      if (!u) continue;
      db.update(u.id, {
        matches: u.matches + 1,
        wins: u.wins + (p === winner ? 1 : 0),
        kos: u.kos + p.kos,
      });
    }
  }

  // ---------------------------------------------------------- phases
  private startCountdown() {
    this.state.phase = 'countdown';
    this.state.countdown = 3;
    this.lock();
    this.updateMeta();
    const players = [...this.state.players.values()];
    players.forEach((p, i) => {
      p.lives = START_LIVES;
      p.kos = 0;
      p.alive = true;
      p.slot = i;
      this.spawn(p);
    });
    const tick = this.clock.setInterval(() => {
      this.state.countdown--;
      if (this.state.countdown <= 0) {
        tick.clear();
        this.state.phase = 'playing';
        this.matchStartedWith = players.length;
        for (const p of this.state.players.values()) p.invulnT = 0;
      }
    }, 1000);
  }

  private backToLobby() {
    this.state.phase = 'waiting';
    this.state.winnerName = '';
    for (const p of this.state.players.values()) {
      p.alive = true;
      p.lives = START_LIVES;
      p.kos = 0;
      this.spawn(p, true);
    }
    this.unlock();
    this.updateMeta();
  }

  // ---------------------------------------------------------- helpers
  private spawn(p: Player, invuln = false) {
    const s = SPAWN_POINTS[p.slot % SPAWN_POINTS.length];
    p.x = s.x;
    p.y = s.y;
    p.vx = p.vy = 0;
    p.hp = MAX_HP;
    p.respawnT = 0;
    p.hitstunT = 0;
    p.attack = null;
    p.lastHitBy = '';
    p.facing = s.x < 480 ? 1 : -1;
    p.invulnT = invuln ? RESPAWN_INVULN : 0;
    p.invuln = invuln;
  }

  private freeSlot() {
    const used = new Set([...this.state.players.values()].map((p) => p.slot));
    for (let i = 0; i < 10; i++) if (!used.has(i)) return i;
    return 0;
  }

  private connectedPlayers() {
    return [...this.state.players.values()].filter((p) => p.connected);
  }

  private updateMeta() {
    const host = this.state.players.get(this.state.hostId);
    this.setMetadata({
      roomName: this.state.roomName,
      host: host?.name ?? '',
      phase: this.state.phase,
    });
  }
}
