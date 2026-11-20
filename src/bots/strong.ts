// Strong bots: Monte Carlo over hidden cards. For each candidate move, deal the unseen cards
// many times consistently with what is known, play the rest out, and pick the best average score.

import { type Card, type Strain, type Suit, cardPoints as cardValue, makeDeck, sameCard, trumpOf } from '../engine/cards';
import { type BazarAction, type BazarState, type Contract, type ContraLevel, MAX_LEVEL, bazarOptions, teamOf4 } from '../engine/bazar';
import { type Combo, resolveCombos } from '../engine/combos';
import { type Deal4, legalCards4, order4, partnerOf4 } from '../engine/deal4';
import { type Deal2, type TrumpAction, legalCards2, trumpOptions2 } from '../engine/deal2';
import { type Rng, shuffle } from '../engine/rng';
import { type DealTally, score2, score4 } from '../engine/scoring';
import type { PlayedCard } from '../engine/tricks';
import { handStrength } from './evaluate';
import { inferVoids, sampleHands, without } from './knowledge';
import { type SimDeal, cloneSim, playOut, simStep } from './sim';

const PLAY_SAMPLES = 60;
const BID_SAMPLES = 40;
const TRUMP_SAMPLES = 80;
const STRAINS: Strain[] = ['S', 'H', 'D', 'C', 'NT'];

const argmax = (values: number[]): number => values.reduce((best, v, i) => (v > values[best] ? i : best), 0);
const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
const noVoids = (n: number) => Array.from({ length: n }, () => new Set<Suit>());

/** Cards of the combinations shown by the comparison winner (public after the first trick). */
function shownCards(perSeat: Combo[][], seats: number[], played: Card[]): Card[][] {
  return perSeat.map((combos, s) => {
    if (!seats.includes(s)) return [];
    const out: Card[] = [];
    for (const c of combos.flatMap((x) => x.cards)) {
      if (!out.some((o) => sameCard(o, c)) && !played.some((p) => sameCard(p, c))) out.push(c);
    }
    return out;
  });
}

// ---------------------------------------------------------------- 4 players: play

export function strongPlay4(d: Deal4, seat: number, rng: Rng): Card {
  const legal = legalCards4(d, seat);
  if (legal.length === 1) return legal[0];
  const contract = d.contract!;
  const strain = contract.bid.strain;
  const trump = trumpOf(strain);
  const tricks = d.tricks.map((t) => t.cards);
  const played = [...tricks.flat(), ...d.trick].map((p) => p.card);
  const myHand = d.hands[seat];
  const pool = without(without(makeDeck(32), myHand), played);
  const voids = inferVoids(4, [...tricks, d.trick], trump, partnerOf4);
  const combos = d.combos!;
  const shownSeats =
    d.tricks.length > 0 && combos.winnerTeam !== null ? [0, 1, 2, 3].filter((s) => s !== seat && teamOf4(s) === combos.winnerTeam) : [];
  const fixed = shownCards(combos.perSeat, shownSeats, played);
  const counts = d.hands.map((h, s) => (s === seat ? 0 : h.length));
  const blotRaw = knownBlot4(d, seat);
  const tally = { cardRaw: [0, 0], tricksWon: [0, 0] };
  for (const t of d.tricks) {
    const side = teamOf4(t.winner);
    tally.tricksWon[side]++;
    tally.cardRaw[side] += t.cards.reduce((s, p) => s + cardValue(p.card, strain), 0);
  }

  const totals = legal.map(() => 0);
  for (let k = 0; k < PLAY_SAMPLES; k++) {
    const hands = sampleHands(pool, counts, voids, fixed, rng);
    hands[seat] = myHand.slice();
    const base: SimDeal = {
      n: 4,
      strain,
      hands,
      trick: d.trick.slice(),
      turn: seat,
      cardRaw: tally.cardRaw.slice(),
      tricksWon: tally.tricksWon.slice(),
      tricksDone: d.tricks.length,
      sideOf: teamOf4,
      partnerOf: partnerOf4,
      attackingSide: contract.team,
    };
    legal.forEach((card, i) => {
      const s = cloneSim(base);
      simStep(s, card);
      playOut(s);
      totals[i] += diff4(contract, s, combos.comboRaw, blotRaw, teamOf4(seat));
    });
  }
  return legal[argmax(totals)];
}

function diff4(contract: Contract, s: SimDeal, comboRaw: number[], blotRaw: number[], side: number): number {
  const t: DealTally = { cardRaw: s.cardRaw, tricksWon: s.tricksWon, comboRaw, blotRaw };
  const p = score4(contract, t).points;
  return p[side] - p[1 - side];
}

/** Բլոտ counts only if it is ours or already announced (both K and Q of trump played by one seat). */
function knownBlot4(d: Deal4, seat: number): number[] {
  const c = d.combos!;
  if (c.blotSeat === null) return [0, 0];
  const trump = trumpOf(d.contract!.bid.strain);
  const playedBy = [...d.tricks.flatMap((t) => t.cards), ...d.trick].filter(
    (p) => p.seat === c.blotSeat && p.card.suit === trump && (p.card.rank === 'K' || p.card.rank === 'Q'),
  );
  return c.blotSeat === seat || playedBy.length === 2 ? c.blotRaw : [0, 0];
}

// ---------------------------------------------------------------- 4 players: bazar

interface Layout {
  hands: Card[][];
}

/** Opponents' and partner's bids say something about their hands: reject layouts that contradict them. */
function bidsAccept(b: BazarState, seat: number) {
  const best = new Map<number, { level: number; strain: Strain }>();
  for (const h of b.history) {
    if (h.seat !== seat && h.action.type === 'bid') best.set(h.seat, h.action.bid);
  }
  return (hands: Card[][]) =>
    [...best].every(([s, bid]) => handStrength(hands[s], bid.strain) + 25 >= Math.min(bid.level, 16) * 10 - 20);
}

function sampleLayouts(b: BazarState, seat: number, hand: readonly Card[], rng: Rng, n: number): Layout[] {
  const pool = without(makeDeck(32), hand);
  const counts = [8, 8, 8, 8].map((c, s) => (s === seat ? 0 : c));
  const accept = bidsAccept(b, seat);
  return Array.from({ length: n }, () => {
    const hands = sampleHands(pool, counts, noVoids(4), [[], [], [], []], rng, accept);
    hands[seat] = hand.slice();
    return { hands };
  });
}

interface Outcome {
  tally: DealTally;
}

/** Plays every layout out with the given strain and attacking team. */
function outcomes(layouts: Layout[], dealer: number, strain: Strain, attackingTeam: number): Outcome[] {
  return layouts.map(({ hands }) => {
    const combos = resolveCombos(hands, strain, order4(dealer), teamOf4, 2);
    const s: SimDeal = {
      n: 4,
      strain,
      hands: hands.map((h) => h.slice()),
      trick: [],
      turn: (dealer + 1) % 4,
      cardRaw: [0, 0],
      tricksWon: [0, 0],
      tricksDone: 0,
      sideOf: teamOf4,
      partnerOf: partnerOf4,
      attackingSide: attackingTeam,
    };
    playOut(s);
    return { tally: { cardRaw: s.cardRaw, tricksWon: s.tricksWon, comboRaw: combos.comboRaw, blotRaw: combos.blotRaw } };
  });
}

function contractEV(outs: Outcome[], contract: Contract, side: number): number {
  return mean(
    outs.map((o) => {
      const p = score4(contract, o.tally).points;
      return p[side] - p[1 - side];
    }),
  );
}

export function strongBazar4(b: BazarState, seat: number, hand: readonly Card[], rng: Rng): BazarAction | null {
  const o = bazarOptions(b, seat);
  const me = teamOf4(seat);
  const cur = b.current;

  if (b.phase === 'awaitSur') {
    if (!o.sur || seat !== cur!.seat) return null;
    const outs = outcomes(sampleLayouts(b, seat, hand, rng, BID_SAMPLES), b.dealer, cur!.bid.strain, me);
    const c = (contra: ContraLevel): Contract => ({ declarer: seat, team: me, bid: cur!.bid, contra });
    return contractEV(outs, c(2), me) > contractEV(outs, c(1), me) + 1 ? { type: 'sur' } : { type: 'pass' };
  }
  if (seat !== b.turn) return null;

  const layouts = sampleLayouts(b, seat, hand, rng, BID_SAMPLES);
  const contractOf = (declarer: number, bid = cur!.bid, contra: ContraLevel = 0): Contract => ({
    declarer,
    team: teamOf4(declarer),
    bid,
    contra,
  });
  // EV for us if the standing contract is played.
  let standingEV = 0;
  if (cur) {
    const outs = outcomes(layouts, b.dealer, cur.bid.strain, teamOf4(cur.seat));
    standingEV = contractEV(outs, contractOf(cur.seat), me);
    if (o.contra && cur.bid.level >= 9) {
      const contraEV = contractEV(outs, contractOf(cur.seat, cur.bid, 1), me);
      if (contraEV > standingEV + 3) return { type: 'contra' };
    }
  }
  if (b.phase === 'lastBidderOption' || o.minLevel === null || o.mustKaput) return { type: 'pass' };

  let best: { ev: number; level: number; strain: Strain } | null = null;
  for (const strain of STRAINS) {
    const outs = outcomes(layouts, b.dealer, strain, me);
    for (let level = o.minLevel; level <= Math.min(MAX_LEVEL, o.minLevel + 12); level++) {
      const ev = contractEV(outs, contractOf(seat, { level, strain, kaput: false }), me);
      if (!best || ev > best.ev) best = { ev, level, strain };
    }
  }
  const threshold = !cur ? 0 : teamOf4(cur.seat) === me ? standingEV + 4 : standingEV;
  if (!best || best.ev <= threshold) return { type: 'pass' };
  return { type: 'bid', bid: { level: best.level, strain: best.strain, kaput: false } };
}

// ---------------------------------------------------------------- 2 players

export function strongTrump2(d: Deal2, seat: number, rng: Rng): TrumpAction {
  const o = trumpOptions2(d, seat);
  const suits: Suit[] = o.take ? [d.turnUp.suit] : o.name;
  const first = 1 - d.dealer;
  const pool = without(without(makeDeck(24), d.hands[seat]), [d.turnUp]);
  const totals = suits.map(() => 0);
  for (let k = 0; k < TRUMP_SAMPLES; k++) {
    const rest = shuffle(pool, rng);
    const hands: Card[][] = [[], []];
    hands[seat] = d.hands[seat].slice();
    hands[1 - seat] = rest.slice(0, 5);
    hands[first].push(...rest.slice(5, 8));
    hands[d.dealer].push(...rest.slice(8, 11));
    suits.forEach((suit, i) => {
      const combos = resolveCombos(hands, suit, [first, d.dealer], (s) => s, 2);
      const s: SimDeal = {
        n: 2,
        strain: suit,
        hands: hands.map((h) => h.slice()),
        trick: [],
        turn: first,
        cardRaw: [0, 0],
        tricksWon: [0, 0],
        tricksDone: 0,
        sideOf: (x) => x,
        partnerOf: () => null,
        attackingSide: seat,
      };
      playOut(s);
      const p = score2(seat, { cardRaw: s.cardRaw, tricksWon: s.tricksWon, comboRaw: combos.comboRaw, blotRaw: combos.blotRaw }).points;
      totals[i] += p[seat] - p[1 - seat];
    });
  }
  const i = argmax(totals);
  if (o.pass && totals[i] / TRUMP_SAMPLES < 1) return { type: 'pass' };
  return o.take ? { type: 'take' } : { type: 'name', suit: suits[i] };
}

export function strongPlay2(d: Deal2, seat: number, rng: Rng): Card {
  const legal = legalCards2(d, seat);
  if (legal.length === 1) return legal[0];
  const opp = 1 - seat;
  const strain = d.trump!;
  const tricks = d.tricks.map((t) => t.cards);
  const played = [...tricks.flat(), ...d.trick].map((p) => p.card);
  const myHand = d.hands[seat];
  // Unseen cards: the opponent's hand plus the undealt stock (minus the turned card, which we saw).
  const pool = without(without(without(makeDeck(24), myHand), played), [d.turnUp]);
  const voids = [...inferVoids(2, [...tricks, d.trick], strain, () => null), new Set<Suit>()];
  const combos = d.combos!;
  const shown = d.tricks.length > 0 && combos.winnerTeam === opp ? shownCards(combos.perSeat, [opp], played) : [[], []];
  const fixed = [...shown, []];
  const counts = [0, 0, 0];
  counts[opp] = d.hands[opp].length;
  counts[2] = pool.length - counts[opp];
  const blotRaw = combos.blotSeat === seat ? combos.blotRaw : knownBlot2(d);
  const tally = { cardRaw: [0, 0], tricksWon: [0, 0] };
  for (const t of d.tricks) {
    tally.tricksWon[t.winner]++;
    tally.cardRaw[t.winner] += t.cards.reduce((s, p) => s + cardValue(p.card, strain), 0);
  }

  const totals = legal.map(() => 0);
  for (let k = 0; k < PLAY_SAMPLES; k++) {
    const sampled = sampleHands(pool, counts, voids, fixed, rng);
    const hands: Card[][] = [[], []];
    hands[seat] = myHand.slice();
    hands[opp] = sampled[opp];
    const base: SimDeal = {
      n: 2,
      strain,
      hands,
      trick: d.trick.slice() as PlayedCard[],
      turn: seat,
      cardRaw: tally.cardRaw.slice(),
      tricksWon: tally.tricksWon.slice(),
      tricksDone: d.tricks.length,
      sideOf: (x) => x,
      partnerOf: () => null,
      attackingSide: d.taker!,
    };
    legal.forEach((card, i) => {
      const s = cloneSim(base);
      simStep(s, card);
      playOut(s);
      const p = score2(d.taker!, { cardRaw: s.cardRaw, tricksWon: s.tricksWon, comboRaw: combos.comboRaw, blotRaw }).points;
      totals[i] += p[seat] - p[opp];
    });
  }
  return legal[argmax(totals)];
}

function knownBlot2(d: Deal2): number[] {
  const c = d.combos!;
  if (c.blotSeat === null) return [0, 0];
  const n = [...d.tricks.flatMap((t) => t.cards), ...d.trick].filter(
    (p) => p.seat === c.blotSeat && p.card.suit === d.trump && (p.card.rank === 'K' || p.card.rank === 'Q'),
  ).length;
  return n === 2 ? c.blotRaw : [0, 0];
}
