// HTTP + WebSocket server: serves the built client and runs rooms.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { TARGETS } from '../src/engine/match';
import { toLevel } from '../src/bots';
import type { ClientMsg, RoomSettings, ServerMsg } from '../src/net/protocol';
import { Room, RoomError } from './room';

const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_IDLE_MS = 10 * 60_000;

interface Live {
  room: Room;
  sockets: Map<number, Set<WebSocket>>;
  timer: NodeJS.Timeout | null;
  idleSince: number | null;
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

function serveStatic(distDir: string | null, req: http.IncomingMessage, res: http.ServerResponse): void {
  if (!distDir || !fs.existsSync(distDir)) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Client not built. Run `npm run build`, or use `npm run dev`.');
    return;
  }
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = path.normalize(path.join(distDir, urlPath));
  if (!file.startsWith(distDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(distDir, 'index.html');
  }
  res.writeHead(200, { 'content-type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

function cleanSettings(s: Partial<RoomSettings> | undefined): RoomSettings {
  return {
    players: s?.players === 2 ? 2 : 4,
    target: TARGETS.includes(s?.target as never) ? (s!.target as RoomSettings['target']) : 101,
    level: toLevel(s?.level),
  };
}

const cleanName = (name: unknown): string =>
  (typeof name === 'string' ? name.trim().slice(0, 20) : '') || 'Player';

export interface GameServer {
  port: number;
  close: () => Promise<void>;
}

export function startServer(port: number, distDir: string | null = null): Promise<GameServer> {
  const rooms = new Map<string, Live>();
  const server = http.createServer((req, res) => serveStatic(distDir, req, res));
  const wss = new WebSocketServer({ server, path: '/ws' });

  const send = (ws: WebSocket, msg: ServerMsg) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };

  const broadcast = (live: Live) => {
    for (const [seat, set] of live.sockets) {
      const msg: ServerMsg = { type: 'room', view: live.room.view(seat) };
      for (const ws of set) send(ws, msg);
    }
  };

  const schedule = (live: Live) => {
    if (live.timer) clearTimeout(live.timer);
    live.timer = null;
    const next = live.room.nextBot();
    if (!next) return;
    live.timer = setTimeout(() => {
      live.timer = null;
      try {
        live.room.runBot(next.seat);
      } catch (e) {
        console.error(`room ${live.room.id}: bot failed`, e);
        return;
      }
      broadcast(live);
      schedule(live);
    }, Math.max(0, next.at - Date.now()));
  };

  const newRoomId = () => {
    let id = '';
    do {
      id = Array.from({ length: 5 }, () => ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)]).join('');
    } while (rooms.has(id));
    return id;
  };

  wss.on('connection', (ws) => {
    let ctx: { live: Live; seat: number } | null = null;

    const detach = () => {
      if (!ctx) return;
      const { live, seat } = ctx;
      const set = live.sockets.get(seat);
      set?.delete(ws);
      if (!set || set.size === 0) {
        live.sockets.delete(seat);
        live.room.disconnect(seat);
      }
      if (live.sockets.size === 0) live.idleSince = Date.now();
      ctx = null;
      broadcast(live);
      schedule(live);
    };

    const attach = (live: Live, seat: number, token: string) => {
      detach();
      ctx = { live, seat };
      if (!live.sockets.has(seat)) live.sockets.set(seat, new Set());
      live.sockets.get(seat)!.add(ws);
      live.idleSince = null;
      send(ws, { type: 'welcome', roomId: live.room.id, token, seat });
      broadcast(live);
      schedule(live);
    };

    ws.on('message', (data) => {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return send(ws, { type: 'error', code: 'bad', message: 'Bad JSON' });
      }
      try {
        if (msg.type === 'create') {
          const room = new Room(newRoomId(), cleanSettings(msg.settings));
          const live: Live = { room, sockets: new Map(), timer: null, idleSince: null };
          rooms.set(room.id, live);
          const { seat, token } = room.join(cleanName(msg.name));
          return attach(live, seat, token);
        }
        if (msg.type === 'join') {
          const live = rooms.get(String(msg.roomId ?? '').toUpperCase());
          if (!live) throw new RoomError('notFound', 'Room not found');
          const { seat, token } = live.room.join(cleanName(msg.name), msg.token);
          return attach(live, seat, token);
        }
        if (!ctx) throw new RoomError('bad', 'Join a room first');
        const { live } = ctx;
        live.room.handle(ctx.seat, msg);
        // A 'sit' moves this connection to another seat.
        if (msg.type === 'sit') {
          live.sockets.get(ctx.seat)?.delete(ws);
          if (live.sockets.get(ctx.seat)?.size === 0) live.sockets.delete(ctx.seat);
          ctx.seat = msg.seat;
          if (!live.sockets.has(msg.seat)) live.sockets.set(msg.seat, new Set());
          live.sockets.get(msg.seat)!.add(ws);
        }
        broadcast(live);
        schedule(live);
      } catch (e) {
        const err = e instanceof RoomError ? e : new RoomError('bad', (e as Error).message);
        send(ws, { type: 'error', code: err.code, message: err.message });
      }
    });

    ws.on('close', detach);
  });

  const sweeper = setInterval(() => {
    for (const [id, live] of rooms) {
      if (live.idleSince !== null && Date.now() - live.idleSince > ROOM_IDLE_MS) {
        if (live.timer) clearTimeout(live.timer);
        rooms.delete(id);
      }
    }
  }, 60_000);

  return new Promise((resolve) => {
    server.listen(port, () => {
      const address = server.address();
      resolve({
        port: typeof address === 'object' && address ? address.port : port,
        close: () =>
          new Promise<void>((done) => {
            clearInterval(sweeper);
            for (const live of rooms.values()) if (live.timer) clearTimeout(live.timer);
            for (const ws of wss.clients) ws.terminate();
            wss.close();
            server.close(() => done());
          }),
      });
    });
  });
}
