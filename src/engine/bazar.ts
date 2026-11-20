// Բազար (auction) for the 4-player game — RULES.md Բ2.

import type { Strain } from './cards';

export const MIN_LEVEL = 8;
/** Bonuses count toward the contract, so bids may exceed 16 (capot 25 + all scoring carrés). */
export const MAX_LEVEL = 80;

export interface Bid {
  level: number;
  strain: Strain;
  kaput: boolean;
}

export type BazarAction =
  | { type: 'pass' } // «Լավ եմ»
  | { type: 'bid'; bid: Bid }
  | { type: 'contra' } // քուանշ
  | { type: 'sur' }; // սուր

export type ContraLevel = 0 | 1 | 2;

export interface Contract {
  declarer: number;
  team: number;
  bid: Bid;
  contra: ContraLevel;
}

export type BazarPhase =
  | 'bidding'
  | 'lastBidderOption' // three «Լավ եմ» after a bid: the last bidder may raise/change or pass
  | 'awaitSur' // after քուանշ: the declaring team may say սուր or pass
  | 'done'
  | 'redeal';

export interface BazarState {
  dealer: number;
  turn: number;
  phase: BazarPhase;
  current: { seat: number; bid: Bid } | null;
  passesInRow: number;
  contra: ContraLevel;
  history: { seat: number; action: BazarAction }[];
}

export const teamOf4 = (seat: number): number => seat % 2;
const next = (seat: number): number => (seat + 1) % 4;

export function newBazar(dealer: number): BazarState {
  return { dealer, turn: next(dealer), phase: 'bidding', current: null, passesInRow: 0, contra: 0, history: [] };
}

export interface BazarOptions {
  pass: boolean;
  /** Lowest legal bid level for this seat now, or null if it cannot bid. */
  minLevel: number | null;
  /** Only capot bids are allowed (a capot is already standing). */
  mustKaput: boolean;
  /** In lastBidderOption the bidder may repeat the level with another strain. */
  sameLevelChange: boolean;
  contra: boolean;
  sur: boolean;
}

export function bazarOptions(s: BazarState, seat: number): BazarOptions {
  const none: BazarOptions = { pass: false, minLevel: null, mustKaput: false, sameLevelChange: false, contra: false, sur: false };
  if (s.phase === 'done' || s.phase === 'redeal') return none;
  const declTeam = s.current ? teamOf4(s.current.seat) : null;
  if (s.phase === 'awaitSur') {
    const mine = declTeam === teamOf4(seat);
    return { ...none, pass: mine, sur: mine };
  }
  const canContra = s.current !== null && s.contra === 0 && declTeam !== teamOf4(seat);
  if (seat !== s.turn) return { ...none, contra: canContra };
  const lastOption = s.phase === 'lastBidderOption';
  const minLevel = s.current ? s.current.bid.level + (lastOption ? 0 : 1) : MIN_LEVEL;
  return {
    pass: true,
    minLevel: minLevel <= MAX_LEVEL ? minLevel : null,
    mustKaput: s.current?.bid.kaput ?? false,
    sameLevelChange: lastOption,
    contra: canContra,
    sur: false,
  };
}

function checkBid(s: BazarState, bid: Bid): void {
  const opts = bazarOptions(s, s.turn);
  if (!Number.isInteger(bid.level) || opts.minLevel === null || bid.level < opts.minLevel || bid.level > MAX_LEVEL) {
    throw new Error(`Illegal bid level ${bid.level}`);
  }
  if (opts.mustKaput && !bid.kaput) throw new Error('After a capot only capot bids are allowed');
  const cur = s.current?.bid;
  if (cur && bid.level === cur.level && bid.strain === cur.strain && bid.kaput === cur.kaput) {
    throw new Error('Same bid repeated');
  }
}

export function applyBazar(state: BazarState, seat: number, action: BazarAction): BazarState {
  const s: BazarState = structuredClone(state);
  const opts = bazarOptions(s, seat);
  s.history.push({ seat, action });

  switch (action.type) {
    case 'contra':
      if (!opts.contra) throw new Error('Contra not allowed');
      s.contra = 1;
      s.phase = 'awaitSur';
      return s;

    case 'sur':
      if (!opts.sur) throw new Error('Sur not allowed');
      s.contra = 2;
      s.phase = 'done';
      return s;

    case 'pass':
      if (!opts.pass) throw new Error('Pass not allowed');
      if (s.phase === 'awaitSur' || s.phase === 'lastBidderOption') {
        s.phase = 'done';
        return s;
      }
      s.passesInRow++;
      if (!s.current && s.passesInRow === 4) s.phase = 'redeal';
      else if (s.current && s.passesInRow === 3) {
        s.phase = 'lastBidderOption';
        s.turn = s.current.seat;
      } else s.turn = next(seat);
      return s;

    case 'bid':
      if (seat !== s.turn || opts.minLevel === null) throw new Error('Not your turn to bid');
      checkBid(s, action.bid);
      s.current = { seat, bid: { ...action.bid } };
      s.passesInRow = 0;
      s.phase = 'bidding';
      s.turn = next(seat);
      return s;
  }
}

export function contractOf(s: BazarState): Contract {
  if (s.phase !== 'done' || !s.current) throw new Error('Bazar is not finished');
  return { declarer: s.current.seat, team: teamOf4(s.current.seat), bid: s.current.bid, contra: s.contra };
}
