// ============================================================
//  Server entry point — HTTP API + Colyseus game server
//  ចំណុចចាប់ផ្តើមរបស់ server
// ============================================================
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { authRouter } from './auth.ts';
import { ArenaRoom } from './rooms/ArenaRoom.ts';

const PORT = Number(process.env.PORT) || 2567;

const app = express();
app.use(cors());
app.use(express.json({ limit: '20kb' }));

app.use('/api', authRouter);

// Public room list for the lobby browser
app.get('/api/rooms', async (_req, res) => {
  const rooms = await matchMaker.query({ name: 'arena' });
  res.json(
    rooms
      .filter((r) => !r.private)
      .map((r) => ({
        code: r.roomId,
        name: r.metadata?.roomName ?? 'Arena',
        host: r.metadata?.host ?? '',
        phase: r.metadata?.phase ?? 'waiting',
        players: r.clients,
        maxPlayers: r.maxClients,
        locked: r.locked,
      })),
  );
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// In production, the server also serves the built game (client/dist)
const clientDist = path.resolve(process.cwd(), '../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api|matchmake).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  console.log('📦 Serving client from', clientDist);
}

const httpServer = http.createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define('arena', ArenaRoom);

gameServer.listen(PORT).then(() => {
  console.log(`🎮 Pixel Brawl server running on http://localhost:${PORT}`);
});
