// ============================================================
//  Pixel Brawl — app entry: screens, character creator, lobby,
//  in-game HUD and controls.
//  ចំណុចចាប់ផ្តើម: ផ្ទាំងនីមួយៗ, បង្កើតតួអង្គ, lobby, HUD
// ============================================================
import './style.css';
import Phaser from 'phaser';
import type { Room } from 'colyseus.js';
import { api, setToken, getToken, createRoom, joinRoom, PublicUser, RoomInfo } from './api.ts';
import { GameScene, SLOT_COLORS } from './game/GameScene.ts';
import { drawPreview, FrameName } from './game/sprites.ts';
import { sfx, toggleMute, isMuted } from './sound.ts';
import {
  Appearance, DEFAULT_APPEARANCE, SKIN_TONES, HAIR_STYLES, sanitizeAppearance,
  InputState, EMPTY_INPUT, WORLD_W, WORLD_H, START_LIVES,
} from '../../shared/game.ts';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

let user: PublicUser | null = null;
let look: Appearance = { ...DEFAULT_APPEARANCE };
let lookDirty = false;
let room: Room | null = null;
let game: Phaser.Game | null = null;

// ============================================================ screens
function show(id: 'auth' | 'menu' | 'game') {
  for (const s of ['auth', 'menu', 'game']) $(`#screen-${s}`).classList.toggle('hidden', s !== id);
  if (id === 'menu') { refreshRooms(); renderMe(); }
}

// ============================================================ animated previews
const POSES: Record<string, FrameName[]> = {
  idle: ['idle0', 'idle1'], run: ['run0', 'run1', 'run2', 'run3'], punch: ['idle0', 'punch', 'punch'], kick: ['idle0', 'kick', 'kick'],
};
let pose = 'idle';
let animTick = 0;
setInterval(() => {
  animTick++;
  const frames = POSES[pose];
  const speed = pose === 'run' ? 1 : 3;
  const f = frames[Math.floor(animTick / speed) % frames.length];
  if (!$('#screen-menu').classList.contains('hidden')) drawPreview($('#preview'), look, f);
  if (!$('#screen-auth').classList.contains('hidden')) {
    const heroFrames: FrameName[] = ['idle0', 'idle0', 'idle1', 'idle1', 'punch', 'idle0', 'kick', 'kick'];
    drawPreview($('#auth-hero'), heroLook, heroFrames[Math.floor(animTick / 3) % heroFrames.length]);
  }
}, 100);
const heroLook = randomLook();

// ============================================================ auth
let authMode: 'login' | 'register' = 'login';
document.querySelectorAll<HTMLButtonElement>('.tab').forEach((t) =>
  t.addEventListener('click', () => {
    authMode = t.dataset.mode as 'login' | 'register';
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
    $('#auth-submit').textContent = authMode === 'login' ? 'LOGIN' : 'CREATE ACCOUNT';
    $('#auth-error').textContent = '';
  }),
);

$('#auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $<HTMLButtonElement>('#auth-submit');
  btn.disabled = true;
  $('#auth-error').textContent = '';
  try {
    const u = $<HTMLInputElement>('#auth-user').value.trim();
    const p = $<HTMLInputElement>('#auth-pass').value;
    const res = authMode === 'login' ? await api.login(u, p) : await api.register(u, p);
    setToken(res.token);
    onLoggedIn(res.user);
  } catch (err: any) {
    $('#auth-error').textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

function onLoggedIn(u: PublicUser) {
  user = u;
  look = sanitizeAppearance(u.appearance);
  lookDirty = false;
  buildCreator();
  show('menu');
}

$('#btn-logout').addEventListener('click', () => {
  setToken(null);
  user = null;
  show('auth');
});

function renderMe() {
  if (!user) return;
  $('#me-name').textContent = user.username;
  $('#me-stats').textContent = `${user.wins} wins · ${user.matches} matches · ${user.kos} KOs`;
}

// ============================================================ character creator
function randomLook(): Appearance {
  const rc = () => '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
  const hairColors = ['#2b1d16', '#5a3418', '#e8c15a', '#d94848', '#f2f2f2', '#4dc9ff', '#c77dff', '#1b1b2a'];
  return {
    skin: Math.floor(Math.random() * SKIN_TONES.length),
    hair: Math.floor(Math.random() * HAIR_STYLES.length),
    hairColor: hairColors[Math.floor(Math.random() * hairColors.length)],
    shirt: rc(), pants: rc(), shoes: rc(),
  };
}

function buildCreator() {
  const sw = $('#skin-swatches');
  sw.innerHTML = '';
  SKIN_TONES.forEach((c, i) => {
    const b = document.createElement('button');
    b.style.background = c;
    b.title = `Skin ${i + 1}`;
    b.onclick = () => { look.skin = i; changed(); };
    sw.appendChild(b);
  });
  const hs = $('#hair-styles');
  hs.innerHTML = '';
  HAIR_STYLES.forEach((name, i) => {
    const b = document.createElement('button');
    b.textContent = name.toUpperCase();
    b.onclick = () => { look.hair = i; changed(); };
    hs.appendChild(b);
  });
  syncCreator();
}

function syncCreator() {
  $('#skin-swatches').querySelectorAll('button').forEach((b, i) => b.classList.toggle('active', i === look.skin));
  $('#hair-styles').querySelectorAll('button').forEach((b, i) => b.classList.toggle('active', i === look.hair));
  for (const k of ['hairColor', 'shirt', 'pants', 'shoes'] as const) $<HTMLInputElement>(`#c-${k}`).value = look[k];
}

function changed() {
  lookDirty = true;
  $('#save-status').textContent = 'Unsaved changes';
  syncCreator();
}

for (const k of ['hairColor', 'shirt', 'pants', 'shoes'] as const) {
  $<HTMLInputElement>(`#c-${k}`).addEventListener('input', (e) => {
    look[k] = (e.target as HTMLInputElement).value;
    changed();
  });
}
document.querySelectorAll<HTMLButtonElement>('.pose').forEach((b) =>
  b.addEventListener('click', () => {
    pose = b.dataset.pose!;
    document.querySelectorAll('.pose').forEach((x) => x.classList.toggle('active', x === b));
  }),
);
$('#btn-random').addEventListener('click', () => { look = randomLook(); changed(); sfx.click(); });
$('#btn-save').addEventListener('click', () => saveLook());

async function saveLook() {
  try {
    const res = await api.saveCharacter(look);
    look = res.appearance;
    if (user) user.appearance = look;
    lookDirty = false;
    $('#save-status').textContent = 'Saved ✓';
  } catch (err: any) {
    $('#save-status').textContent = err.message;
  }
}

// ============================================================ lobby
async function refreshRooms() {
  const list = $('#room-list');
  try {
    const rooms = await api.rooms();
    list.innerHTML = rooms.length
      ? rooms.map(roomItem).join('')
      : '<li class="empty">No public rooms yet — create one!</li>';
    list.querySelectorAll<HTMLButtonElement>('button[data-code]').forEach((b) =>
      b.addEventListener('click', () => enter(() => joinRoom(b.dataset.code!))),
    );
  } catch (err: any) {
    list.innerHTML = `<li class="empty">${esc(err.message)}</li>`;
  }
}

function roomItem(r: RoomInfo) {
  const full = r.players >= r.maxPlayers;
  const busy = r.locked || r.phase !== 'waiting';
  return `<li>
    <div>
      <div class="r-name">${esc(r.name)} ${busy ? '<span class="tag busy">IN GAME</span>' : '<span class="tag">OPEN</span>'}</div>
      <div class="r-meta">${r.players}/${r.maxPlayers} players · host ${esc(r.host)} · ${r.code}</div>
    </div>
    <button class="btn btn-small btn-cyan" data-code="${r.code}" ${busy || full ? 'disabled' : ''}>JOIN</button>
  </li>`;
}

setInterval(() => { if (!$('#screen-menu').classList.contains('hidden')) refreshRooms(); }, 5000);
$('#btn-refresh').addEventListener('click', () => refreshRooms());

$('#btn-create').addEventListener('click', () => {
  const name = $<HTMLInputElement>('#room-name').value.trim() || `${user?.username}'s room`;
  const max = Number($<HTMLSelectElement>('#room-max').value);
  const priv = $<HTMLInputElement>('#room-private').checked;
  enter(() => createRoom(name, max, priv));
});
$('#btn-join').addEventListener('click', () => {
  const code = $<HTMLInputElement>('#join-code').value.trim();
  if (code.length < 5) { $('#menu-error').textContent = 'Enter a 5-letter room code.'; return; }
  enter(() => joinRoom(code));
});
$('#join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btn-join').click(); });

async function enter(connect: () => Promise<Room>) {
  $('#menu-error').textContent = '';
  try {
    if (lookDirty) await saveLook(); // the server reads your saved fighter
    const r = await connect();
    startGame(r);
  } catch (err: any) {
    const msg = String(err?.message || err);
    $('#menu-error').textContent = /not found/i.test(msg) ? 'Room not found or already started.' : msg;
  }
}

// ============================================================ in game
let hudTimer = 0;
let lastPhase = '';
let lastCountdown = 0;

async function startGame(r: Room) {
  room = r;
  show('game');
  $('#g-room-name').textContent = (r.state as any).roomName || 'Arena';
  $('#g-code').textContent = r.roomId;
  $('#hud').innerHTML = '';
  cardCache.clear();
  lastPhase = '';

  await document.fonts.load('8px "Press Start 2P"').catch(() => {});
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: WORLD_W,
    height: WORLD_H,
    pixelArt: true,
    backgroundColor: '#120d2b',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { keyboard: false },
    banner: false,
  });
  game.scene.add('game', GameScene, true, { room: r });

  r.onMessage('toast', (msg: string) => toast(msg));
  r.onStateChange.once(() => { $('#g-room-name').textContent = (r.state as any).roomName; });
  r.onLeave((code) => {
    if (room !== r) return;
    endGame();
    if (code > 1000) $('#menu-error').textContent = 'Disconnected from the room.';
  });

  inputOn = true;
  hudTimer = window.setInterval(renderHud, 120);
}

function endGame() {
  inputOn = false;
  clearInput();
  window.clearInterval(hudTimer);
  game?.destroy(true);
  game = null;
  room = null;
  $('#banner').classList.add('hidden');
  api.me().then((r) => { user = r.user; renderMe(); }).catch(() => {});
  show('menu');
}

$('#g-leave').addEventListener('click', () => {
  const r = room;
  endGame();
  r?.leave(true);
});
$('#g-code').addEventListener('click', () => {
  navigator.clipboard?.writeText($('#g-code').textContent || '');
  toast('Room code copied!');
});

window.addEventListener('pb-toast', (e) => toast((e as CustomEvent<string>).detail));

function toast(msg: string) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ---------- HUD + banners ----------
const cardCache = new Map<string, string>();

function renderHud() {
  if (!room) return;
  const s = room.state as any;
  const me = s.players.get(room.sessionId);
  const players: any[] = [];
  s.players.forEach((p: any) => players.push(p));
  players.sort((a, b) => a.slot - b.slot);

  // player cards
  const hud = $('#hud');
  const ids = new Set(players.map((p) => p.id));
  hud.querySelectorAll<HTMLElement>('.card').forEach((c) => { if (!ids.has(c.dataset.id!)) { c.remove(); cardCache.delete(c.dataset.id!); } });
  for (const p of players) {
    let card = hud.querySelector<HTMLElement>(`.card[data-id="${p.id}"]`);
    if (!card) {
      card = document.createElement('div');
      card.className = 'card';
      card.dataset.id = p.id;
      card.innerHTML = `<canvas width="56" height="52"></canvas><div><div class="c-name"></div><div class="c-info"></div></div>`;
      hud.appendChild(card);
    }
    if (cardCache.get(p.id) !== p.look) {
      cardCache.set(p.id, p.look);
      try { drawPreview(card.querySelector('canvas')!, sanitizeAppearance(JSON.parse(p.look)), 'idle0'); } catch {}
    }
    const name = card.querySelector<HTMLElement>('.c-name')!;
    name.innerHTML = `${p.id === s.hostId ? '<span class="host-crown">♛</span> ' : ''}${esc(p.name)}${p.id === room.sessionId ? ' (you)' : ''}`;
    name.style.color = SLOT_COLORS[p.slot % SLOT_COLORS.length];
    const playing = s.phase === 'playing' || s.phase === 'countdown' || s.phase === 'ended';
    const hearts = playing ? '♥'.repeat(p.lives) + '♡'.repeat(Math.max(0, START_LIVES - p.lives)) : '';
    const extras =
      (p.buff === 'power' ? ' 🥊' : p.buff === 'speed' ? ' ⚡' : '') + (p.hasBomb ? ' 💣' : '');
    const special = p.id === room.sessionId
      ? `<br><span class="${p.specialCd ? 'sp-wait' : 'sp-ready'}">SPECIAL ${p.specialCd ? (p.specialCd / 10).toFixed(1) + 's' : 'READY'}</span>`
      : '';
    card.querySelector('.c-info')!.innerHTML =
      `<span class="hearts">${hearts}</span> HP ${p.hp}${playing ? ` · ${p.kos} KO` : ''}${extras}${p.connected ? '' : ' · reconnecting…'}${special}`;
    card.classList.toggle('out', !p.alive);
  }

  // phase banners + sounds
  const banner = $('#banner');
  if (s.phase !== lastPhase) {
    if (s.phase === 'playing') { sfx.go(); flashGo(); }
    if (s.phase === 'ended') sfx.win();
    lastPhase = s.phase;
  }
  if (s.phase === 'countdown' && s.countdown !== lastCountdown) sfx.count();
  lastCountdown = s.countdown;

  if (s.phase === 'waiting') {
    const isHost = s.hostId === room.sessionId;
    const enough = players.filter((p) => p.connected).length >= 2;
    const html = `PRACTICE MODE · ${players.length}/${s.maxPlayers} PLAYERS<br>` +
      (isHost
        ? `<button id="btn-start" class="btn btn-gold" ${enough ? '' : 'disabled'}>${enough ? 'START MATCH' : 'NEED 2+ PLAYERS'}</button>`
        : `<span class="muted">Waiting for the host to start…</span>`) +
      `<br><span class="muted">Share code <b style="color:var(--cyan)">${s.code}</b> with friends</span>`;
    setBanner('', html);
    banner.querySelector('#btn-start')?.addEventListener('click', () => room?.send('start'));
  } else if (s.phase === 'countdown') {
    setBanner('big', String(s.countdown));
  } else if (s.phase === 'playing') {
    if (goUntil > Date.now()) setBanner('big', 'GO!');
    else if (me && !me.alive) setBanner('', 'YOU ARE OUT · SPECTATING');
    else banner.classList.add('hidden');
  } else if (s.phase === 'ended') {
    const rows = [...players].sort((a, b) => Number(b.alive) - Number(a.alive) || b.kos - a.kos)
      .map((p) => `<tr><td style="color:${SLOT_COLORS[p.slot % 10]}">${esc(p.name)}</td><td>${p.kos} KO</td><td>${'♥'.repeat(p.lives)}</td></tr>`).join('');
    setBanner('results', `<div class="win">🏆 ${esc(s.winnerName)} WINS!</div><table>${rows}</table><p class="muted">Back to lobby in a few seconds…</p>`);
  }
}

let goUntil = 0;
const flashGo = () => { goUntil = Date.now() + 800; };

let bannerKey = '';
function setBanner(kind: string, html: string) {
  const b = $('#banner');
  b.classList.remove('hidden');
  if (bannerKey === kind + html) return; // avoid re-rendering (keeps buttons clickable)
  bannerKey = kind + html;
  b.className = `banner ${kind}`;
  b.innerHTML = html;
}

// ============================================================ controls
let inputOn = false;
const input: InputState = { ...EMPTY_INPUT };
let lastSent = '';

const KEYS: Record<string, keyof InputState> = {
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  KeyW: 'jump', ArrowUp: 'jump', Space: 'jump', KeyS: 'down', ArrowDown: 'down',
  KeyJ: 'punch', KeyZ: 'punch', KeyK: 'kick', KeyX: 'kick',
  KeyL: 'block', KeyC: 'block', ShiftLeft: 'block', KeyI: 'special', KeyV: 'special',
};

function setKey(k: keyof InputState, down: boolean) {
  if (input[k] === down) return;
  input[k] = down;
  if (down && k === 'jump') sfx.jump();
  sendInput();
}

function sendInput() {
  const s = JSON.stringify(input);
  if (s === lastSent || !room) return;
  lastSent = s;
  room.send('input', input);
}

function clearInput() {
  (Object.keys(input) as (keyof InputState)[]).forEach((k) => (input[k] = false));
  sendInput();
}

window.addEventListener('keydown', (e) => {
  if (!inputOn || (e.target as HTMLElement).tagName === 'INPUT') return;
  const k = KEYS[e.code];
  if (!k) return;
  e.preventDefault();
  if (!e.repeat) setKey(k, true);
});
window.addEventListener('keyup', (e) => {
  const k = KEYS[e.code];
  if (k && inputOn) setKey(k, false);
});
window.addEventListener('blur', () => inputOn && clearInput());

// touch buttons for phones
const isTouch = 'ontouchstart' in window || matchMedia('(pointer: coarse)').matches;
$('#touch').classList.toggle('hidden', !isTouch);
document.querySelectorAll<HTMLButtonElement>('#touch button').forEach((b) => {
  const k = b.dataset.key as keyof InputState;
  const on = (e: Event) => { e.preventDefault(); b.classList.add('on'); setKey(k, true); };
  const off = (e: Event) => { e.preventDefault(); b.classList.remove('on'); setKey(k, false); };
  b.addEventListener('pointerdown', on);
  b.addEventListener('pointerup', off);
  b.addEventListener('pointerleave', off);
  b.addEventListener('pointercancel', off);
});

// ============================================================ sound toggle
const muteLabel = () => (isMuted() ? '♪̸' : '♪');
for (const id of ['#btn-mute', '#g-mute']) {
  $(id).textContent = muteLabel();
  $(id).addEventListener('click', () => {
    toggleMute();
    document.querySelectorAll('#btn-mute, #g-mute').forEach((b) => (b.textContent = muteLabel()));
  });
}

// ============================================================ start
(async () => {
  if (getToken()) {
    try {
      const { user } = await api.me();
      return onLoggedIn(user);
    } catch {
      setToken(null);
    }
  }
  show('auth');
})();