// End-to-end over real WebSockets: two players create/join a 2-player room and play a full deal.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { type GameServer, startServer } from '../server/hub';
import { type Match2, legalCards2, trumpOptions2 } from '../src/engine';
import type { ClientMsg, RoomView, ServerMsg } from '../src/net/protocol';

let server: GameServer;
beforeAll(async () => {
  server = await startServer(0);
});
afterAll(async () => {
  await server.close();
});

class Client {
  ws: WebSocket;
  view: RoomView | null = null;
  welcome: Extract<ServerMsg, { type: 'welcome' }> | null = null;
  errors: string[] = [];
  private waiters: (() => void)[] = [];

  constructor(port: number) {
    this.ws = new WebSocket(`ws://localhost:${port}/ws`);
    this.ws.on('message', (data) => {
      const msg = JSON.parse(String(data)) as ServerMsg;
      if (msg.type === 'room') this.view = msg.view;
      if (msg.type === 'welcome') this.welcome = msg;
      if (msg.type === 'error') this.errors.push(msg.code);
      this.waiters.splice(0).forEach((w) => w());
    });
  }
  opened = () => new Promise<void>((r) => this.ws.once('open', () => r()));
  send = (m: ClientMsg) => this.ws.send(JSON.stringify(m));
  async until(pred: () => boolean, ms = 5000): Promise<void> {
    const end = Date.now() + ms;
    while (!pred()) {
      if (Date.now() > end) throw new Error('timeout');
      await new Promise<void>((r) => {
        this.waiters.push(r);
        setTimeout(r, 50);
      });
    }
  }
}

/** Makes this client's move if it is its turn; returns true if it sent something. */
function act(c: Client): boolean {
  const m = c.view?.match as Match2 | null;
  if (!m || m.winner !== null) return false;
  const seat = c.view!.mySeat;
  const d = m.deal;
  if (d.turn !== seat) return false;
  if (d.phase === 'trump1' || d.phase === 'trump2') {
    const o = trumpOptions2(d, seat);
    c.send({ type: 'trump', action: o.take ? { type: 'take' } : o.name.length ? { type: 'name', suit: o.name[0] } : { type: 'pass' } });
    return true;
  }
  if (d.phase === 'play') {
    c.send({ type: 'play', card: legalCards2(d, seat)[0] });
    return true;
  }
  return false;
}

describe('game server', () => {
  it('two players create, join and finish a deal; hands stay hidden', async () => {
    const a = new Client(server.port);
    const b = new Client(server.port);
    await Promise.all([a.opened(), b.opened()]);

    a.send({ type: 'create', name: 'Anna', settings: { players: 2, target: 101, level: 4 } });
    await a.until(() => a.welcome !== null);
    const roomId = a.welcome!.roomId;
    expect(roomId).toMatch(/^[A-Z2-9]{5}$/);

    b.send({ type: 'join', roomId: roomId.toLowerCase(), name: 'Bob' });
    await b.until(() => b.view?.seats[1].name === 'Bob');

    b.send({ type: 'start' });
    await b.until(() => b.errors.includes('notHost'));
    a.send({ type: 'start' });
    await a.until(() => a.view?.started === true);
    await b.until(() => b.view?.started === true);

    const opp = (a.view!.match as Match2).deal.hands[1];
    expect(opp.every((c) => c.suit === 'S' && c.rank === '7')).toBe(true);

    // A public fingerprint of the game state; both clients must agree before the next move.
    const key = (c: Client) => {
      const m = c.view!.match as Match2;
      return `${m.history.length}|${m.deal.phase}|${m.deal.turn}|${m.deal.tricks.length}|${m.deal.trick.length}`;
    };
    for (let moves = 0; (a.view!.match as Match2).history.length === 0; moves++) {
      if (moves > 40) throw new Error('too many moves');
      const before = key(a);
      expect(act(a) || act(b)).toBe(true);
      await a.until(() => key(a) !== before);
      await b.until(() => key(b) === key(a));
    }
    const m = a.view!.match as Match2;
    expect(m.history).toHaveLength(1);
    expect(m.lastDeal!.score!.points.reduce((s, x) => s + x, 0)).toBeGreaterThan(0);
    expect(a.view!.waitingFor.sort()).toEqual([0, 1]);
    a.send({ type: 'continue' });
    await b.until(() => b.view!.waitingFor.length === 1);

    a.ws.close();
    await b.until(() => b.view!.seats[0].connected === false);
    b.ws.close();
  }, 20_000);

  it('unknown room → notFound', async () => {
    const c = new Client(server.port);
    await c.opened();
    c.send({ type: 'join', roomId: 'ZZZZZ', name: 'X' });
    await c.until(() => c.errors.includes('notFound'));
    c.ws.close();
  });
});
