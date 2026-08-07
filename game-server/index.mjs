/**
 * RealTimeEscape authoritative game server.
 *
 * One private team session maps to one Colyseus Room instance. This process is deliberately
 * NOT deployed to Vercel — it holds long-lived stateful WebSocket sessions and a simulation
 * loop. Deploy to Railway, Render or Fly; see docs/ARCHITECTURE.md (ADR-003).
 *
 *   cd game-server && npm install && npm start
 */

import { createServer } from 'node:http';
import express from 'express';
import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { BurnWindowRoom } from './BurnWindowRoom.mjs';

const port = Number(process.env.PORT ?? 2567);
const app = express();

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'realtimeescape-game-server', uptime: process.uptime() });
});

const httpServer = createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define('burn_window', BurnWindowRoom).filterBy(['bookingId']);

gameServer.listen(port).then(() => {
  console.log(`[game-server] listening on ${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`[game-server] ${signal} — draining rooms`);
    gameServer.gracefullyShutdown().then(() => process.exit(0));
  });
}
