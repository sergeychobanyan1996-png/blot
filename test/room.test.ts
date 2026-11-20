import { describe, expect, it } from 'vitest';
import { ACK_TIMEOUT_MS, Room, RoomError, TAKEOVER_MS } from '../server/room';
import { type Match4, bazarOptions, cardId, legalCards4, teamOf4 } from '../src/engine';

function setup4() {
  let clock = 1_000_000;
  const room = new Room('ABCDE', { players: 4, target: 101, level: 'easy' }, () => clock);
  const a = room.join('Anna');
  const b = room.join('Bob');
  return { room, a, b, tick: (ms: number) => (clock += ms), now: () => clock };
}

/** Plays one move for whoever must move: a due bot, or a human (pass in bazar, first legal card). */
function step(room: Room, humans: number[], now: number): void {
  const next = room.nextBot();
  if (next && next.at <= now) return room.runBot(next.seat);
  const m = room.match as Match4;
  const d = m.deal;
  for (const seat of humans) {
    if (d.phase === 'bazar') {
      const o = bazarOptions(d.bazar, seat);
      if (d.bazar.phase === 'awaitSur' && o.pass) return room.handle(seat, { type: 'bazar', action: { type: 'pass' } });
      if (d.bazar.turn === seat && d.bazar.phase !== 'awaitSur') {
        const action = o.minLevel !== null && !d.bazar.current ? { type: 'bid' as const, bid: { level: 8, strain: 'H' as const, kaput: false } } : { type: 'pass' as const };
        return room.handle(seat, { type: 'bazar', action });
      }
    } else if (d.phase === 'play' && d.turn === seat) {
      return room.handle(seat, { type: 'play', card: legalCards4(d, seat)[0] });
    }
  }
  throw new Error('nobody can move');
}

describe('online room', () => {
  it('seats, sitting, host-only start, bots fill empty seats', () => {
    const { room, b } = setup4();
    expect(b.seat).toBe(1);
    room.handle(1, { type: 'sit', seat: 2 }); // Bob becomes Anna's partner
    expect(room.seats.map((s) => s.name)).toEqual(['Anna', null, 'Bob', null]);
    expect(() => room.handle(2, { type: 'start' })).toThrow(RoomError);
    room.handle(0, { type: 'start' });
    expect(room.seats.map((s) => s.bot)).toEqual([false, true, false, true]);
  });

  it('views hide other hands and the deck seed', () => {
    const { room } = setup4();
    room.handle(0, { type: 'start' });
    const v = room.view(0);
    const m = v.match as Match4;
    const real = room.match as Match4;
    expect(m.seed).toBe(0);
    expect(m.deal.hands[0].map(cardId)).toEqual(real.deal.hands[0].map(cardId));
    expect(new Set(m.deal.hands[1].map(cardId))).toEqual(new Set(['7S']));
    expect(m.deal.hands[1]).toHaveLength(8);
    expect(m.deal.dealtHands).toEqual([]);
  });

  it('reconnects by token to the same seat; a new player takes a bot seat mid-game', () => {
    const { room, a } = setup4();
    room.handle(0, { type: 'start' });
    room.disconnect(0);
    expect(room.join('Anna', a.token)).toEqual({ seat: 0, token: a.token });
    const c = room.join('Carl');
    expect(room.seats[c.seat].bot).toBe(false);
    expect(room.seats[c.seat].name).toBe('Carl');
  });

  it('rejects illegal moves and moves out of turn', () => {
    const { room } = setup4();
    room.handle(0, { type: 'start' });
    const d = (room.match as Match4).deal;
    const notTurn = [0, 1].find((s) => s !== d.bazar.turn)!;
    expect(() => room.handle(notTurn, { type: 'bazar', action: { type: 'pass' } })).toThrow(RoomError);
    expect(() => room.handle(0, { type: 'trump', action: { type: 'pass' } })).toThrow(RoomError);
  });

  it('a disconnected player is replaced by a bot only after the takeover delay', () => {
    const { room, now, tick } = setup4();
    room.handle(0, { type: 'start' });
    const d = (room.match as Match4).deal;
    const human = [0, 1].find((s) => s === d.bazar.turn);
    if (human === undefined) return; // first to speak is a bot; covered by the full-game test
    room.disconnect(human);
    const next = room.nextBot()!;
    expect(next.seat).toBe(human);
    expect(next.at).toBeGreaterThanOrEqual(now() + TAKEOVER_MS);
    tick(TAKEOVER_MS);
  });

  it('plays a whole match with two humans and two bots, waiting for acks between deals', () => {
    const { room, tick, now } = setup4();
    room.handle(0, { type: 'start' });
    let deals = 0;
    for (let i = 0; i < 5000 && room.match!.winner === null; i++) {
      const before = room.match!.history.length;
      tick(2000);
      step(room, [0, 1], now());
      if (room.match!.history.length > before && room.match!.history.at(-1)!.bidder !== null) {
        deals++;
        const v = room.view(0);
        expect(v.waitingFor.sort()).toEqual([0, 1]);
        // Bots wait for the acks (or the timeout).
        const next = room.nextBot();
        if (next) expect(next.at).toBeGreaterThanOrEqual(now() + ACK_TIMEOUT_MS - 1);
        room.handle(0, { type: 'continue' });
        room.handle(1, { type: 'continue' });
        expect(room.view(0).waitingFor).toEqual([]);
      }
    }
    expect(room.match!.winner).not.toBeNull();
    expect(deals).toBeGreaterThan(0);
    expect([0, 1]).toContain(teamOf4(room.match!.winner!));
    expect(() => room.handle(1, { type: 'rematch' })).toThrow(RoomError);
    room.handle(0, { type: 'rematch' });
    expect(room.match!.winner).toBeNull();
    expect(room.match!.history).toEqual([]);
  });
});
