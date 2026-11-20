// Bonus combinations — RULES.md Ա3–Ա5.
// MVP: combinations are detected and declared automatically from the dealt hand.

import { type Card, type Rank, type Strain, type Suit, RANKS, SUITS, naturalIndex } from './cards';

export type Combo =
  | { kind: 'seq'; suit: Suit; length: number; top: Rank; value: number; cards: Card[] }
  | { kind: 'carre'; rank: Rank; value: number; cards: Card[] };

const seqValue = (length: number): number => (length >= 5 ? 100 : length === 4 ? 50 : 20);

/** Runs of 3+ in natural order; a run of 5 or more is a single «100». */
export function findSequences(hand: readonly Card[]): Combo[] {
  const out: Combo[] = [];
  for (const suit of SUITS) {
    const idx = hand
      .filter((c) => c.suit === suit)
      .map((c) => naturalIndex(c.rank))
      .sort((a, b) => a - b);
    let start = 0;
    for (let i = 1; i <= idx.length; i++) {
      if (i < idx.length && idx[i] === idx[i - 1] + 1) continue;
      const length = i - start;
      if (length >= 3) {
        const ranks = idx.slice(start, i).map((j) => RANKS[j]);
        out.push({
          kind: 'seq',
          suit,
          length,
          top: ranks[length - 1],
          value: seqValue(length),
          cards: ranks.map((rank) => ({ suit, rank })),
        });
      }
      start = i;
    }
  }
  return out;
}

const CARRE_TRUMP: Record<Rank, number> = { '7': 0, '8': 0, '9': 140, '10': 100, J: 200, Q: 100, K: 100, A: 110 };
const CARRE_NT: Record<Rank, number> = { '7': 0, '8': 0, '9': 0, '10': 100, J: 100, Q: 100, K: 100, A: 190 };
// Weakest → strongest, for comparing two four-of-a-kinds.
const CARRE_ORDER_TRUMP: readonly Rank[] = ['Q', 'K', '10', 'A', '9', 'J'];
const CARRE_ORDER_NT: readonly Rank[] = ['J', 'Q', 'K', '10', 'A'];

export const carreValue = (rank: Rank, strain: Strain): number =>
  (strain === 'NT' ? CARRE_NT : CARRE_TRUMP)[rank];

/** Four of a kind; 7s, 8s (and 9s in Բոյ) are worth 0 and are not combinations. */
export function findCarres(hand: readonly Card[], strain: Strain): Combo[] {
  const out: Combo[] = [];
  for (const rank of RANKS) {
    const cards = hand.filter((c) => c.rank === rank);
    const value = carreValue(rank, strain);
    if (cards.length === 4 && value > 0) out.push({ kind: 'carre', rank, value, cards });
  }
  return out;
}

export const findCombos = (hand: readonly Card[], strain: Strain): Combo[] => [
  ...findCarres(hand, strain),
  ...findSequences(hand),
];

/** Բլոտ-Ռեբլոտ: K + Q of trump in one hand (trump contracts only). */
export const hasBlot = (hand: readonly Card[], strain: Strain): boolean =>
  strain !== 'NT' &&
  hand.some((c) => c.suit === strain && c.rank === 'K') &&
  hand.some((c) => c.suit === strain && c.rank === 'Q');

export const BLOT_VALUE = 20;

/** Lexicographic comparison key (Ա4): category, value, then tie-breakers. */
export function comboKey(combo: Combo, strain: Strain): number[] {
  if (combo.kind === 'carre') {
    const order = strain === 'NT' ? CARRE_ORDER_NT : CARRE_ORDER_TRUMP;
    return [2, combo.value, order.indexOf(combo.rank)];
  }
  return [1, combo.value, naturalIndex(combo.top), combo.suit === strain ? 1 : 0];
}

export function compareKeys(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export interface ComboResolution {
  perSeat: Combo[][];
  /** Seat holding the strongest combination, or null if nobody has one. */
  bestSeat: number | null;
  winnerTeam: number | null;
  /** Raw combination points per team; only the winning team's are counted. */
  comboRaw: number[];
  /** Raw Բլոտ points per team; always counted. */
  blotRaw: number[];
  blotSeat: number | null;
}

/**
 * @param hands dealt hands by seat
 * @param order seats in playing order starting from the player after the dealer (tie-break)
 * @param teamOf team index of a seat
 */
export function resolveCombos(
  hands: readonly (readonly Card[])[],
  strain: Strain,
  order: readonly number[],
  teamOf: (seat: number) => number,
  teamCount: number,
): ComboResolution {
  const perSeat = hands.map((h) => findCombos(h, strain));
  let bestSeat: number | null = null;
  let bestKey: number[] | null = null;
  for (const seat of order) {
    for (const combo of perSeat[seat]) {
      const key = comboKey(combo, strain);
      // Strictly greater: on a full tie the earlier player in order keeps it.
      if (!bestKey || compareKeys(key, bestKey) > 0) {
        bestKey = key;
        bestSeat = seat;
      }
    }
  }
  const winnerTeam = bestSeat === null ? null : teamOf(bestSeat);
  const comboRaw = Array.from({ length: teamCount }, () => 0);
  if (winnerTeam !== null) {
    perSeat.forEach((combos, seat) => {
      if (teamOf(seat) === winnerTeam) comboRaw[winnerTeam] += combos.reduce((s, c) => s + c.value, 0);
    });
  }
  const blotRaw = Array.from({ length: teamCount }, () => 0);
  const blotSeat = hands.findIndex((h) => hasBlot(h, strain));
  if (blotSeat >= 0) blotRaw[teamOf(blotSeat)] += BLOT_VALUE;
  return { perSeat, bestSeat, winnerTeam, comboRaw, blotRaw, blotSeat: blotSeat >= 0 ? blotSeat : null };
}
