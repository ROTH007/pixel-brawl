# 🎮 Pixel Brawl — Online Pixel Fighting Game (V1)

Make your pixel fighter, create a room, share the code, and knock your friends off the map.
បង្កើតតួអង្គ pixel របស់អ្នក បង្កើតបន្ទប់ ចែករំលែកលេខកូដ ហើយវាយមិត្តភក្តិឲ្យធ្លាក់ពីវេទិកា!

**Tech:** Phaser 3 + TypeScript (client) · Colyseus + Node.js (server) · JSON-file database (swap for Supabase/PostgreSQL later)

---

## ✅ What's in V1

- Register / login (passwords hashed with bcrypt, login token = JWT)
- Character creator: 6 skin tones, 7 hair styles, custom colors, random button, live animated preview
- Lobbies: create a room (2–10 players, public or private), 5-letter room code, public room list, join by code
- Practice mode while waiting for players (you can fight, nobody loses lives)
- Host starts the match → 3-2-1 countdown → fight
- Side-view arena: run, double jump, drop through wooden platforms, punch, kick
- Smash-style knockback: the lower your HP, the further you fly. Fall off the map or reach 0 HP = lose a life
- 3 lives each, last player standing wins → results screen → back to the lobby
- Wins / matches / KOs saved to your account
- Server-authoritative (no cheating), smooth movement, hit sparks, damage numbers, screen shake, retro sounds
- Touch buttons on phones, reconnection within 15 seconds if Wi-Fi drops

---

## 🚀 Run it on your computer (ជំហានដំណើរការ)

**Requirement:** [Node.js 20 or newer](https://nodejs.org)

### Step 1 — Install packages (ដំឡើង packages)
```bash
cd server
npm install
cd ../client
npm install
```

### Step 2 — Start the server (Terminal 1)
```bash
cd server
npm run dev
```
You should see: `🎮 Pixel Brawl server running on http://localhost:2567`

### Step 3 — Start the game (Terminal 2)
```bash
cd client
npm run dev
```
Open **http://localhost:5173**

### Step 4 — Test multiplayer (សាកល្បងលេងច្រើននាក់)
1. Open the game in **two browser windows** (use one normal + one incognito window, because both share the login otherwise).
2. Register two different accounts.
3. Window 1: **Create room** → copy the 5-letter code.
4. Window 2: type the code → **Join**.
5. Window 1 (host): **Start match**.

**Play with friends on the same Wi-Fi:** run `ipconfig` (Windows) or `ifconfig` (Mac/Linux) to find your IP, e.g. `192.168.1.20`. Friends open `http://192.168.1.20:5173`. (Allow Node.js through your firewall if asked.)

---

## 🎮 Controls

| Action | Keyboard | Phone |
|---|---|---|
| Move | A D or ← → | ◀ ▶ |
| Jump (press again = double jump) | W, ↑ or Space | ▲ |
| Drop through wood / fall faster | S or ↓ | ▼ |
| Punch (fast, 8 dmg) | J or Z | P |
| Kick (slow, 13 dmg, strong knockback) | K or X | K |

---

## 📁 Project structure (រចនាសម្ព័ន្ធគម្រោង)

```
pixel-brawl/
├── shared/
│   └── game.ts            ← game rules shared by server + client (physics, attacks, map, character options)
├── server/
│   └── src/
│       ├── index.ts       ← starts HTTP API + Colyseus game server
│       ├── auth.ts        ← register / login / save character
│       ├── db.ts          ← tiny JSON database (replace with Supabase later)
│       └── rooms/
│           ├── ArenaRoom.ts  ← one lobby/match: join, start, KO, winner
│           ├── schema.ts     ← data synced to all players
│           └── sim.ts        ← physics + combat (server only = no cheating)
└── client/
    ├── index.html         ← all screens
    └── src/
        ├── main.ts        ← login, character creator, lobby, HUD, controls
        ├── api.ts         ← talks to the server
        ├── sound.ts       ← retro sound effects (made with code)
        ├── style.css
        └── game/
            ├── GameScene.ts  ← draws players smoothly from server state
            ├── sprites.ts    ← draws pixel characters with code
            └── stage.ts      ← draws the background + platforms
```

**How it works (របៀបដំណើរការ):**
1. Your browser sends only your **button presses** to the server.
2. The server runs the physics and combat **60 times per second** and decides who hit whom.
3. The server sends positions to everyone **30 times per second**.
4. Each browser **smoothly slides** characters toward the latest positions, so movement looks smooth.

**Tweak the game:** open `shared/game.ts` and change values like `JUMP_VELOCITY`, `MOVE_SPEED`, attack `damage` / `knockback`, `START_LIVES`, or the `PLATFORMS` list. Restart the server after changing it.

---

## 🌍 Put it online (Deploy)

The server can also serve the game, so you only deploy **one app**:

```bash
cd client && npm run build      # creates client/dist
cd ../server && npm start       # serves the API, the game and multiplayer on one port
```

Then open `http://localhost:2567`.

On a host like **Railway, Render, Fly.io** or a **VPS in Singapore** (best ping from Cambodia):
- Upload the whole `pixel-brawl` folder (with `shared/`)
- Install command: `cd client && npm install && npm run build && cd ../server && npm install`
- Start command: `cd server && npm start`
- Set environment variables:
  - `JWT_SECRET` = a long random string (**required**, keeps logins safe)
  - `PORT` is usually set by the host automatically
  - `DATA_DIR` = a folder on a persistent disk, so accounts aren't lost when the server restarts

⚠️ Free hosts often delete files on restart. For real players, move accounts to **Supabase/PostgreSQL** by rewriting only `server/src/db.ts`.

---

## 🛣️ Ideas for V2

- Client-side prediction for your own fighter (even snappier on slow internet)
- More maps and a map vote
- Special move + block / dodge
- Leaderboard page, friends list, in-room chat
- Supabase login (Google sign-in)
- Sound/music settings and gamepad support
