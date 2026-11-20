// One deal of 2-player Բլոտ: 5 cards + turned card → trump choice → the rest of the deal → 8 tricks → score.
// Round 1: take the turned card's suit (the taker gets the turned card + 2, the other 3).
// Round 2: name another suit or Բոյ, optionally taking the turned card; the dealer must choose.

import { type Card, type Strain, type Suit, makeDeck, sameCard, trumpOf } from './cards';
import type { ComboResolution } from './combos';
import { type Declarations, type DeclareStage, announce, beforePlay, declareStage, newDeclarations, resolveDeclared, show } from './declare';
import { type Rng, shuffle } from './rng';
import { type DealTally, type Score2, score2 } from './scoring';
import { type PlayedCard, type TrickRecord, legalCards, winningIndex } from './tricks';
import { tallyTricks } from './tally';

export type TrumpAction =
  | { type: 'take' }
  | { type: 'pass' }
  | { type: 'name'; strain: Strain; takeCard: boolean };

export interface Deal2 {
  dealer: number;
  phase: 'trump1' | 'trump2' | 'play' | 'done';
  hands: Card[][];
  dealtHands: Card[][];
  turnUp: Card;
  /** Cards never dealt (includes the turned card once trump is chosen). */
  stock: Card[];
  turn: number;
  taker: number | null;
  /** The contract: a trump suit or 'NT' (Բոյ). */
  trump: Strain | null;
  /** Whether the taker took the turned card into their hand. */
  tookCard: boolean;
  decl: Declarations | null;
  /** Final comparison of the shown combinations; set when the deal ends. */
  combos: ComboResolution | null;
  trick: PlayedCard[];
  tricks: TrickRecord[];
  tally: DealTally | null;
  score: Score2 | null;
}

const other = (seat: number): number => 1 - seat;
const self = (seat: number): number => seat;

export function startDeal2(dealer: number, rng: Rng): Deal2 {
  const deck = shuffle(makeDeck(24), rng);
  const first = other(dealer);
  const hands: Card[][] = [[], []];
  hands[first] = deck.slice(0, 5);
  hands[dealer] = deck.slice(5, 10);
  return {
    dealer,
    phase: 'trump1',
    hands,
    dealtHands: [],
    turnUp: deck[10],
    stock: deck.slice(11),
    turn: first,
    taker: null,
    trump: null,
    tookCard: false,
    decl: null,
    combos: null,
    trick: [],
    tricks: [],
    tally: null,
    score: null,
  };
}

export function trumpOptions2(deal: Deal2, seat: number): { take: boolean; pass: boolean; name: Strain[] } {
  const none = { take: false, pass: false, name: [] as Strain[] };
  if (seat !== deal.turn) return none;
  if (deal.phase === 'trump1') return { take: true, pass: true, name: [] };
  if (deal.phase === 'trump2') {
    const strains = (['S', 'H', 'D', 'C', 'NT'] as Strain[]).filter((s) => s !== deal.turnUp.suit);
    // The dealer speaks last in round two and must choose.
    return { take: false, pass: seat !== deal.dealer, name: strains };
  }
  return none;
}

function chooseTrump(d: Deal2, seat: number, strain: Strain, takeCard: boolean): void {
  const first = other(d.dealer);
  d.taker = seat;
  d.trump = strain;
  d.tookCard = takeCard;
  // Everyone ends with 8 cards: the taker of the turned card gets 2 more, everyone else 3.
  const extra = (s: number) => (takeCard && s === seat ? 2 : 3);
  if (takeCard) d.hands[seat].push(d.turnUp);
  let next = 0;
  for (const s of [first, d.dealer]) {
    d.hands[s].push(...d.stock.slice(next, next + extra(s)));
    next += extra(s);
  }
  d.stock = takeCard ? d.stock.slice(next) : [d.turnUp, ...d.stock.slice(next)];
  d.dealtHands = structuredClone(d.hands);
  d.decl = newDeclarations(d.dealtHands, strain);
  d.phase = 'play';
  d.turn = first;
}

export function trump2(deal: Deal2, seat: number, action: TrumpAction): Deal2 {
  const opts = trumpOptions2(deal, seat);
  const d = structuredClone(deal);
  if (action.type === 'take') {
    if (!opts.take) throw new Error('Cannot take now');
    chooseTrump(d, seat, d.turnUp.suit, true);
  } else if (action.type === 'name') {
    if (!opts.name.includes(action.strain)) throw new Error('Cannot name that suit');
    chooseTrump(d, seat, action.strain, action.takeCard === true);
  } else {
    if (!opts.pass) throw new Error('Cannot pass now');
    if (seat !== d.dealer) d.turn = d.dealer;
    else {
      d.phase = 'trump2';
      d.turn = other(d.dealer);
    }
  }
  return d;
}

export function declareStage2(deal: Deal2, seat: number): DeclareStage {
  if (deal.phase !== 'play' || seat !== deal.turn || !deal.decl) return null;
  return declareStage(deal.decl, seat, deal.tricks.length);
}

export function announce2(deal: Deal2, seat: number, picks: readonly number[]): Deal2 {
  if (deal.phase !== 'play' || seat !== deal.turn) throw new Error('Not your turn');
  return { ...deal, decl: announce(deal.decl!, seat, picks, deal.tricks.length) };
}

export function show2(deal: Deal2, seat: number): Deal2 {
  if (deal.phase !== 'play' || seat !== deal.turn) throw new Error('Not your turn');
  return { ...deal, decl: show(deal.decl!, seat, deal.tricks.length) };
}

export function legalCards2(deal: Deal2, seat: number): Card[] {
  if (deal.phase !== 'play' || seat !== deal.turn) return [];
  return legalCards(deal.hands[seat], deal.trick, { trump: trumpOf(deal.trump!), partner: null });
}

export function play2(deal: Deal2, seat: number, card: Card): Deal2 {
  if (!legalCards2(deal, seat).some((c) => sameCard(c, card))) throw new Error('Illegal card');
  const d = structuredClone(deal);
  d.decl = beforePlay(d.decl!, seat, d.tricks.length);
  d.hands[seat] = d.hands[seat].filter((c) => !sameCard(c, card));
  d.trick.push({ seat, card });
  if (d.trick.length < 2) {
    d.turn = other(seat);
    return d;
  }
  const winner = d.trick[winningIndex(d.trick, trumpOf(d.trump!))].seat;
  d.tricks.push({ cards: d.trick, winner });
  d.trick = [];
  d.turn = winner;
  if (d.tricks.length === 8) {
    d.combos = resolveDeclared(d.decl, d.trump!, [other(d.dealer), d.dealer], self, 2);
    d.tally = { ...tallyTricks(d.tricks, d.trump!, self), comboRaw: d.combos.comboRaw, blotRaw: d.combos.blotRaw };
    d.score = score2(d.taker!, d.tally);
    d.phase = 'done';
  }
  return d;
}
