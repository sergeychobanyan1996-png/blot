// One online table: seats, the authoritative match, bots for empty or abandoned seats,
// and per-seat views that hide other players' cards. Timing is decided by the caller (hub.ts).

import { randomBytes, randomInt } from 'node:crypto';
import { type Card, type Strain, trumpOf } from '../src/engine/cards';
import { teamOf4 } from '../src/engine/bazar';
import type { Combo } from '../src/engine/combos';
import type { Declarations } from '../src/engine/declare';
import type { PlayedCard } from '../src/engine/tricks';
import type { Deal4 } from '../src/engine/deal4';
import type { Deal2 } from '../src/engine/deal2';
import {
  type Match2,
  type Match4,
  announceMove,
  autoDeclare,
  bazarMove4,
  showMove,
  newMatch2,
  newMatch4,
  playMove2,
  playMove4,
  trumpMove2,
} from '../src/engine/match';
import { botBazar4, botPlay2, botPlay4, botTrump2 } from '../src/bots';
import type { ClientMsg, RoomSettings, RoomView } from '../src/net/protocol';

export const BOT_DELAY_MS = 650;
export const TRICK_HOLD_MS = 1100;
/** How long the table waits for everyone to close the deal result. */
export const ACK_TIMEOUT_MS = 25_000;
/**
 * A player who left gets this long to come back; then a bot of the table's level takes the seat
 * until they return (a minute covers a reload, a dropped connection or switching apps on a phone).
 */
export const TAKEOVER_MS = 60_000;

export class RoomError extends Error {
  constructor(
    public code: 'notFound' | 'full' | 'illegal' | 'notHost' | 'bad',
    message: string,
  ) {
    super(message);
  }
}

interface Seat {
  name: string | null;
  token: string | null;
  bot: boolean;
  connected: boolean;
  disconnectedAt: number | null;
}

const emptySeat = (): Seat => ({ name: null, token: null, bot: false, connected: false, disconnectedAt: null });
const HIDDEN: Card = { suit: 'S', rank: '7' };
const hide = (cards: readonly Card[]): Card[] => cards.map(() => HIDDEN);

export class Room {
  seats: Seat[];
  match: Match4 | Match2 | null = null;
  private hostToken: string | null = null;
  private waiting = new Set<number>();
  private waitingSince = 0;
  private lastChange = 0;
  private trickJustDone = false;

  constructor(
    public readonly id: string,
    public readonly settings: RoomSettings,
    private readonly now: () => number = Date.now,
  ) {
    this.seats = Array.from({ length: settings.players }, emptySeat);
  }

  get started(): boolean {
    return this.match !== null;
  }

  /** Reconnects by token, or takes a free seat (a bot's seat once the game has started). */
  join(name: string, token?: string): { seat: number; token: string } {
    if (token) {
      const seat = this.seats.findIndex((s) => s.token === token);
      if (seat >= 0) {
        // Coming back: the seat is theirs again, the stand-in bot leaves.
        Object.assign(this.seats[seat], { name, connected: true, disconnectedAt: null, bot: false });
        return { seat, token };
      }
    }
    // Mid-game a newcomer takes a bot's seat, preferring seats nobody owns over ones kept for a player who left.
    const seat = this.started ? this.freeBotSeat() : this.seats.findIndex((s) => !s.token);
    if (seat < 0) throw new RoomError('full', 'The table is full');
    const fresh = randomBytes(12).toString('hex');
    this.seats[seat] = { name, token: fresh, bot: false, connected: true, disconnectedAt: null };
    this.hostToken ??= fresh;
    this.lastChange = this.now();
    return { seat, token: fresh };
  }

  private freeBotSeat(): number {
    const unowned = this.seats.findIndex((s) => s.bot && !s.token);
    return unowned >= 0 ? unowned : this.seats.findIndex((s) => s.bot);
  }

  /** Players away longer than TAKEOVER_MS are replaced by a bot. Returns whether anything changed. */
  applyTakeovers(): boolean {
    if (!this.started) return false;
    let changed = false;
    for (const s of this.seats) {
      if (s.token && !s.bot && !s.connected && s.disconnectedAt !== null && this.now() - s.disconnectedAt >= TAKEOVER_MS) {
        s.bot = true;
        changed = true;
      }
    }
    return changed;
  }

  /** When the next waiting player runs out of time (epoch ms), or null. */
  nextTakeoverAt(): number | null {
    if (!this.started) return null;
    const times = this.seats.flatMap((s) => (s.token && !s.bot && !s.connected && s.disconnectedAt !== null ? [s.disconnectedAt + TAKEOVER_MS] : []));
    return times.length ? Math.min(...times) : null;
  }

  disconnect(seat: number): void {
    Object.assign(this.seats[seat], { connected: false, disconnectedAt: this.now() });
    this.waiting.delete(seat);
  }

  hasConnectedHumans(): boolean {
    return this.seats.some((s) => s.connected);
  }

  private requireHost(seat: number): void {
    if (this.seats[seat].token !== this.hostToken) throw new RoomError('notHost', 'Only the host can do this');
  }

  private newMatch(): void {
    const seed = randomInt(2 ** 31);
    this.match = this.settings.players === 4 ? newMatch4(this.settings.target, seed) : newMatch2(this.settings.target, seed);
    this.waiting.clear();
    this.trickJustDone = false;
    this.lastChange = this.now();
  }

  handle(seat: number, msg: ClientMsg): void {
    switch (msg.type) {
      case 'sit': {
        if (this.started) throw new RoomError('illegal', 'The game has started');
        const target = msg.seat;
        if (!Number.isInteger(target) || !this.seats[target] || this.seats[target].token) {
          throw new RoomError('illegal', 'Seat is taken');
        }
        this.seats[target] = this.seats[seat];
        this.seats[seat] = emptySeat();
        return;
      }
      case 'start':
        this.requireHost(seat);
        if (this.started) throw new RoomError('illegal', 'Already started');
        for (const s of this.seats) if (!s.token) s.bot = true;
        // Team names were given from the host's side; the host may have moved to the other team.
        if (this.settings.teamNames && seat % 2 === 1) {
          const [ours, theirs] = this.settings.teamNames;
          this.settings.teamNames = [theirs, ours];
        }
        this.newMatch();
        return;
      case 'rematch':
        this.requireHost(seat);
        if (!this.match || this.match.winner === null) throw new RoomError('illegal', 'The match is not over');
        this.newMatch();
        return;
      case 'continue':
        this.waiting.delete(seat);
        return;
      case 'bazar':
        return this.apply((m) => bazarMove4(this.as4(m), seat, msg.action));
      case 'play':
        return this.apply((m) => (m.players === 4 ? playMove4(m, seat, msg.card) : playMove2(m, seat, msg.card)));
      case 'trump':
        return this.apply((m) => trumpMove2(this.as2(m), seat, msg.action));
      case 'announce':
        return this.apply((m) => announceMove(m, seat, Array.isArray(msg.picks) ? msg.picks : []));
      case 'show':
        return this.apply((m) => showMove(m, seat));
      default:
        throw new RoomError('bad', 'Unknown message');
    }
  }

  private as4(m: Match4 | Match2): Match4 {
    if (m.players !== 4) throw new RoomError('illegal', 'Not a 4-player game');
    return m;
  }

  private as2(m: Match4 | Match2): Match2 {
    if (m.players !== 2) throw new RoomError('illegal', 'Not a 2-player game');
    return m;
  }

  private apply(fn: (m: Match4 | Match2) => Match4 | Match2): void {
    const before = this.match;
    if (!before) throw new RoomError('illegal', 'The game has not started');
    if (before.winner !== null) throw new RoomError('illegal', 'The match is over');
    let after: Match4 | Match2;
    try {
      after = fn(before);
    } catch (e) {
      if (e instanceof RoomError) throw e;
      throw new RoomError('illegal', (e as Error).message);
    }
    if (after.history.length > before.history.length) {
      const dealt = after.history[after.history.length - 1].bidder !== null;
      this.trickJustDone = dealt;
      if (dealt) {
        this.waiting = new Set(this.seats.flatMap((s, i) => (s.connected && !s.bot ? [i] : [])));
        this.waitingSince = this.now();
      }
    } else {
      this.trickJustDone = after.deal.tricks.length > before.deal.tricks.length;
    }
    this.match = after;
    this.lastChange = this.now();
  }

  /** Seat expected to move next, or null if a connected human on the declaring team must decide on սուր. */
  private actor(): number | null {
    const m = this.match;
    if (!m || m.winner !== null) return null;
    if (m.players === 2) return m.deal.turn;
    const d = m.deal;
    if (d.phase === 'bazar' && d.bazar.phase === 'awaitSur') {
      const declarer = d.bazar.current!.seat;
      const team = teamOf4(declarer);
      const humanOnTeam = this.seats.some((s, i) => teamOf4(i) === team && s.connected && !s.bot);
      return humanOnTeam ? null : declarer;
    }
    return d.turn;
  }

  /** When (epoch ms) a bot should move for which seat, or null if waiting for a connected human. */
  nextBot(): { seat: number; at: number } | null {
    const seat = this.actor();
    if (seat === null) return null;
    const s = this.seats[seat];
    let at = this.lastChange + BOT_DELAY_MS + (this.trickJustDone ? TRICK_HOLD_MS : 0);
    if (this.waiting.size > 0) at = Math.max(at, this.waitingSince + ACK_TIMEOUT_MS);
    if (s.bot) return { seat, at };
    if (s.connected) return null;
    return { seat, at: Math.max(at, (s.disconnectedAt ?? 0) + TAKEOVER_MS) };
  }

  /** Lets a bot move for `seat` (an empty seat, or a player who stayed away too long). */
  runBot(seat: number): void {
    const level = this.settings.level;
    this.apply((m) => {
      if (m.players === 2) {
        if (m.deal.phase !== 'play') return trumpMove2(m, seat, botTrump2(m.deal, seat, level));
        const ready = autoDeclare(m, seat);
        return playMove2(ready, seat, botPlay2(ready.deal, seat, level));
      }
      const d = m.deal;
      if (d.phase === 'bazar') {
        const action = botBazar4(d.bazar, seat, d.hands[seat], level);
        if (!action) throw new Error(`Bot at seat ${seat} has no bazar action`);
        return bazarMove4(m, seat, action);
      }
      // A bot announces and shows everything it holds, then plays.
      const ready = autoDeclare(m, seat);
      return playMove4(ready, seat, botPlay4(ready.deal, seat, level));
    });
  }

  view(seat: number): RoomView {
    return {
      roomId: this.id,
      settings: this.settings,
      seats: this.seats.map((s) => ({
        name: s.name,
        bot: s.bot,
        connected: s.connected,
        host: s.token !== null && s.token === this.hostToken,
        takenOver: s.bot && s.token !== null,
        awayMs:
          this.started && !s.bot && !s.connected && s.disconnectedAt !== null
            ? Math.max(0, s.disconnectedAt + TAKEOVER_MS - this.now())
            : null,
      })),
      mySeat: seat,
      started: this.started,
      match: this.match ? redactMatch(this.match, seat) : null,
      waitingFor: [...this.waiting],
    };
  }
}

/**
 * An announcement says only the class ("Թերզ", "50", "Չորս թուղթ"). Once announcements are compared
 * after the first trick, the «բոյ» (top card) is known too — never the suit or the cards.
 */
function classOnly(c: Combo, compared: boolean): Combo {
  if (c.kind === 'seq') return { ...c, suit: 'S', top: compared ? c.top : '7', cards: [] };
  return { ...c, rank: compared ? c.rank : '7', cards: [] };
}

/**
 * Others see what was announced (class only) and shown (cards). Who holds Բլոտ stays private until
 * that player calls it by playing the trump K or Q.
 */
function redactDecl(
  decl: Declarations | null,
  seat: number,
  strain: Strain | null,
  played: PlayedCard[],
  tricksDone: number,
  done: boolean,
): Declarations | null {
  if (!decl || done) return decl;
  const compared = tricksDone >= 1;
  const trump = strain ? trumpOf(strain) : null;
  const b = decl.blotSeat;
  const called = b !== null && played.some((p) => p.seat === b && p.card.suit === trump && (p.card.rank === 'K' || p.card.rank === 'Q'));
  return {
    detected: decl.detected.map((list, s) => (s === seat ? list : [])),
    announced: decl.announced.map((list, s) => (s === seat || !list ? list : list.map((c) => classOnly(c, compared)))),
    shown: decl.shown,
    blotSeat: b === seat || called ? b : null,
    sides: decl.sides,
    leader: decl.leader,
  };
}

const playedIn = (d: { tricks: { cards: PlayedCard[] }[]; trick: PlayedCard[] }) => [...d.tricks.flatMap((t) => t.cards), ...d.trick];

function redactDeal4(d: Deal4, seat: number): Deal4 {
  const decl = redactDecl(d.decl, seat, d.contract?.bid.strain ?? null, playedIn(d), d.tricks.length, d.phase === 'done');
  return { ...d, hands: d.hands.map((h, i) => (i === seat ? h : hide(h))), dealtHands: [], decl };
}

function redactDeal2(d: Deal2, seat: number): Deal2 {
  const decl = redactDecl(d.decl, seat, d.trump, playedIn(d), d.tricks.length, d.phase === 'done');
  return { ...d, hands: d.hands.map((h, i) => (i === seat ? h : hide(h))), dealtHands: [], stock: hide(d.stock), decl };
}

function redactMatch(m: Match4 | Match2, seat: number): Match4 | Match2 {
  if (m.players === 4) {
    return { ...m, seed: 0, deal: redactDeal4(m.deal, seat), lastDeal: m.lastDeal && redactDeal4(m.lastDeal, seat) };
  }
  return { ...m, seed: 0, deal: redactDeal2(m.deal, seat), lastDeal: m.lastDeal && redactDeal2(m.lastDeal, seat) };
}
