// One deal of 2-player Բլոտ: 5 cards + turned card → trump choice → 3 more cards → 8 tricks → score.

import { type Card, type Suit, makeDeck, sameCard } from './cards';
import { type ComboResolution, resolveCombos } from './combos';
import { type Rng, shuffle } from './rng';
import { type DealTally, type Score2, score2 } from './scoring';
import { type PlayedCard, type TrickRecord, legalCards, winningIndex } from './tricks';
import { tallyTricks } from './tally';

export type TrumpAction = { type: 'take' } | { type: 'pass' } | { type: 'name'; suit: Suit };

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
  trump: Suit | null;
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
    combos: null,
    trick: [],
    tricks: [],
    tally: null,
    score: null,
  };
}

export function trumpOptions2(deal: Deal2, seat: number): { take: boolean; pass: boolean; name: Suit[] } {
  const none = { take: false, pass: false, name: [] as Suit[] };
  if (seat !== deal.turn) return none;
  if (deal.phase === 'trump1') return { take: true, pass: true, name: [] };
  if (deal.phase === 'trump2') {
    const suits = (['S', 'H', 'D', 'C'] as Suit[]).filter((s) => s !== deal.turnUp.suit);
    // The dealer speaks last in round two and must choose.
    return { take: false, pass: seat !== deal.dealer, name: suits };
  }
  return none;
}

function chooseTrump(d: Deal2, seat: number, suit: Suit): void {
  const first = other(d.dealer);
  d.taker = seat;
  d.trump = suit;
  d.hands[first].push(...d.stock.slice(0, 3));
  d.hands[d.dealer].push(...d.stock.slice(3, 6));
  d.stock = [d.turnUp, ...d.stock.slice(6)];
  d.dealtHands = structuredClone(d.hands);
  d.combos = resolveCombos(d.dealtHands, suit, [first, d.dealer], self, 2);
  d.phase = 'play';
  d.turn = first;
}

export function trump2(deal: Deal2, seat: number, action: TrumpAction): Deal2 {
  const opts = trumpOptions2(deal, seat);
  const d = structuredClone(deal);
  if (action.type === 'take') {
    if (!opts.take) throw new Error('Cannot take now');
    chooseTrump(d, seat, d.turnUp.suit);
  } else if (action.type === 'name') {
    if (!opts.name.includes(action.suit)) throw new Error('Cannot name that suit');
    chooseTrump(d, seat, action.suit);
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

export function legalCards2(deal: Deal2, seat: number): Card[] {
  if (deal.phase !== 'play' || seat !== deal.turn) return [];
  return legalCards(deal.hands[seat], deal.trick, { trump: deal.trump, partner: null });
}

export function play2(deal: Deal2, seat: number, card: Card): Deal2 {
  if (!legalCards2(deal, seat).some((c) => sameCard(c, card))) throw new Error('Illegal card');
  const d = structuredClone(deal);
  d.hands[seat] = d.hands[seat].filter((c) => !sameCard(c, card));
  d.trick.push({ seat, card });
  if (d.trick.length < 2) {
    d.turn = other(seat);
    return d;
  }
  const winner = d.trick[winningIndex(d.trick, d.trump)].seat;
  d.tricks.push({ cards: d.trick, winner });
  d.trick = [];
  d.turn = winner;
  if (d.tricks.length === 8) {
    const combos = d.combos!;
    d.tally = { ...tallyTricks(d.tricks, d.trump!, self), comboRaw: combos.comboRaw, blotRaw: combos.blotRaw };
    d.score = score2(d.taker!, d.tally);
    d.phase = 'done';
  }
  return d;
}
