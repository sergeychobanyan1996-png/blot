// Matches: a sequence of deals until a side reaches the target — RULES.md Բ7, Գ6.

import type { Card } from './cards';
import type { BazarAction } from './bazar';
import { type Deal4, bazar4, play4, startDeal4 } from './deal4';
import { type Deal2, type TrumpAction, play2, startDeal2, trump2 } from './deal2';
import { dealRng, mulberry32 } from './rng';
import { matchWinner } from './scoring';

export const TARGETS = [101, 151, 201, 301] as const;
export type Target = (typeof TARGETS)[number];

export interface DealSummary {
  dealer: number;
  bidder: number | null;
  made: boolean | null;
  points: number[];
  scoresAfter: number[];
}

interface MatchBase<D> {
  target: Target;
  seed: number;
  dealIndex: number;
  scores: number[];
  deal: D;
  /** The most recently finished (or redealt) deal, kept for result screens. */
  lastDeal: D | null;
  history: DealSummary[];
  /** Winning side (team in 4p, seat in 2p), or null while playing. */
  winner: number | null;
}

export type Match4 = MatchBase<Deal4> & { players: 4 };
export type Match2 = MatchBase<Deal2> & { players: 2 };

/** The first dealer is random; then the deal passes to the dealer's left. */
const firstDealer = (seed: number, players: number): number => Math.floor(mulberry32(seed)() * players);

export function newMatch4(target: Target, seed: number): Match4 {
  return {
    players: 4,
    target,
    seed,
    dealIndex: 0,
    scores: [0, 0],
    deal: startDeal4(firstDealer(seed, 4), dealRng(seed, 0)),
    lastDeal: null,
    history: [],
    winner: null,
  };
}

export function newMatch2(target: Target, seed: number): Match2 {
  return {
    players: 2,
    target,
    seed,
    dealIndex: 0,
    scores: [0, 0],
    deal: startDeal2(firstDealer(seed, 2), dealRng(seed, 0)),
    lastDeal: null,
    history: [],
    winner: null,
  };
}

function nextDeal<M extends Match4 | Match2>(m: M, start: (dealer: number, idx: number) => M['deal']): M {
  const dealIndex = m.dealIndex + 1;
  return { ...m, dealIndex, deal: start((m.deal.dealer + 1) % m.players, dealIndex) } as M;
}

function settle4(m: Match4): Match4 {
  const d = m.deal;
  const start = (dealer: number, idx: number) => startDeal4(dealer, dealRng(m.seed, idx));
  if (d.phase === 'redeal') {
    const history = [...m.history, { dealer: d.dealer, bidder: null, made: null, points: [0, 0], scoresAfter: m.scores }];
    return nextDeal({ ...m, history, lastDeal: d }, start);
  }
  if (d.phase !== 'done') return m;
  const s = d.score!;
  const c = d.contract!;
  const after = m.scores.map((v, i) => v + s.points[i]);
  const winner = matchWinner({
    before: m.scores,
    after,
    target: m.target,
    bidder: c.team,
    made: s.made,
    tharsKaput: s.tharsKaput,
    kaputNoEnd: s.made && d.tally!.tricksWon[c.team] === 8 && c.contra === 0,
  });
  const history = [...m.history, { dealer: d.dealer, bidder: c.team, made: s.made, points: s.points, scoresAfter: after }];
  const settled = { ...m, scores: after, history, winner, lastDeal: d };
  return winner === null ? nextDeal(settled, start) : settled;
}

function settle2(m: Match2): Match2 {
  const d = m.deal;
  if (d.phase !== 'done') return m;
  const s = d.score!;
  const after = m.scores.map((v, i) => v + s.points[i]);
  const winner = matchWinner({ before: m.scores, after, target: m.target, bidder: d.taker!, made: s.made });
  const history = [...m.history, { dealer: d.dealer, bidder: d.taker, made: s.made, points: s.points, scoresAfter: after }];
  const settled = { ...m, scores: after, history, winner, lastDeal: d };
  return winner === null
    ? nextDeal(settled, (dealer, idx) => startDeal2(dealer, dealRng(m.seed, idx)))
    : settled;
}

export function bazarMove4(m: Match4, seat: number, action: BazarAction): Match4 {
  if (m.winner !== null) throw new Error('Match is over');
  return settle4({ ...m, deal: bazar4(m.deal, seat, action) });
}

export function playMove4(m: Match4, seat: number, card: Card): Match4 {
  if (m.winner !== null) throw new Error('Match is over');
  return settle4({ ...m, deal: play4(m.deal, seat, card) });
}

export function trumpMove2(m: Match2, seat: number, action: TrumpAction): Match2 {
  if (m.winner !== null) throw new Error('Match is over');
  return settle2({ ...m, deal: trump2(m.deal, seat, action) });
}

export function playMove2(m: Match2, seat: number, card: Card): Match2 {
  if (m.winner !== null) throw new Error('Match is over');
  return settle2({ ...m, deal: play2(m.deal, seat, card) });
}
