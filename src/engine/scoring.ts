// Deal scoring and match end — RULES.md Ա6, Բ4–Բ7, Գ5–Գ6. All results are in small points.

import type { Strain } from './cards';
import type { Contract, ContraLevel } from './bazar';

/** Ա6: last digit 0–5 rounds down, 6–9 rounds up (75 → 7, 76 → 8). */
export function roundSmall(raw: number): number {
  const q = Math.floor(raw / 10);
  return raw % 10 <= 5 ? q : q + 1;
}

const MULTIPLIER: Record<'trump' | 'NT', [number, number, number]> = { trump: [1, 2, 4], NT: [2, 3, 5] };
export const multiplier = (strain: Strain, contra: ContraLevel): number =>
  MULTIPLIER[strain === 'NT' ? 'NT' : 'trump'][contra];

export interface DealTally {
  /** Raw card points per side, including the last-trick 10. */
  cardRaw: number[];
  tricksWon: number[];
  /** Raw combination points per side (only the comparison winner's are non-zero). */
  comboRaw: number[];
  blotRaw: number[];
}

export interface Score4 {
  made: boolean;
  /** One side took all 8 tricks. */
  kaput: boolean;
  /** Declaring team took no trick: it loses the match immediately. */
  tharsKaput: boolean;
  points: number[];
}

export function score4(contract: Contract, t: DealTally): Score4 {
  const B = contract.team;
  const D = 1 - B;
  const { level, strain, kaput: kaputBid } = contract.bid;
  const bonusB = t.comboRaw[B] + t.blotRaw[B];
  const bonusD = t.comboRaw[D] + t.blotRaw[D];
  const allB = t.tricksWon[B] === 8;
  const allD = t.tricksWon[D] === 8;
  const tharsKaput = t.tricksWon[B] === 0;
  const made = !tharsKaput && t.cardRaw[B] + bonusB >= level * 10 && (!kaputBid || allB);
  const bid = level * multiplier(strain, contract.contra);
  const base = allB || allD ? 25 : 16;

  const points = [0, 0];
  if (made && contract.contra === 0) {
    const opp = roundSmall(t.cardRaw[D]);
    points[B] = bid + base - opp + bonusB / 10;
    points[D] = opp + bonusD / 10;
  } else if (made) {
    points[B] = bid + base + (bonusB + bonusD) / 10;
  } else {
    points[D] = bid + base + (bonusB + bonusD) / 10;
  }
  return { made, kaput: allB || allD, tharsKaput, points };
}

export interface Score2 {
  made: boolean;
  kaput: boolean;
  points: number[];
}

/** 2-player Բլոտ: the taker must collect strictly more than the opponent (bonuses included). */
export function score2(taker: number, t: DealTally): Score2 {
  const T = taker;
  const O = 1 - T;
  const bonusT = t.comboRaw[T] + t.blotRaw[T];
  const bonusO = t.comboRaw[O] + t.blotRaw[O];
  const allT = t.tricksWon[T] === 8;
  const allO = t.tricksWon[O] === 8;
  const made = t.tricksWon[T] > 0 && t.cardRaw[T] + bonusT > t.cardRaw[O] + bonusO;

  const points = [0, 0];
  if (made && allT) {
    points[T] = 21 + bonusT / 10;
    points[O] = bonusO / 10;
  } else if (made) {
    // The taker also gets the undealt cards: 16 − opponent's rounded points.
    const opp = roundSmall(t.cardRaw[O]);
    points[T] = 16 - opp + bonusT / 10;
    points[O] = opp + bonusO / 10;
  } else {
    points[O] = (allO ? 21 : 16) + (bonusT + bonusO) / 10;
  }
  return { made, kaput: allT || allO, points };
}

export interface MatchCheck {
  before: number[];
  after: number[];
  target: number;
  /** Side that took the contract / trump. */
  bidder: number;
  made: boolean;
  tharsKaput?: boolean;
  /** 4 players: a made capot ends the match only if it was contra'd. */
  kaputNoEnd?: boolean;
}

/** Returns the winning side, or null if the match continues. */
export function matchWinner(m: MatchCheck): number | null {
  const B = m.bidder;
  const D = 1 - B;
  if (m.tharsKaput) return D;
  if (m.kaputNoEnd) return null;
  // A team already at the target cannot win by failing its own contract.
  if (!m.made && m.after[B] >= m.target) return m.after[D] > m.after[B] ? D : null;
  const over = [0, 1].filter((side) => m.after[side] >= m.target);
  if (over.length === 0) return null;
  if (over.length === 1) return over[0];
  if (m.after[0] === m.after[1]) return null; // tie past the target: play one more deal
  return m.after[0] > m.after[1] ? 0 : 1;
}
