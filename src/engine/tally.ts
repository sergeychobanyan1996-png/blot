// Shared end-of-deal bookkeeping: card points and tricks per side.

import { type Strain, LAST_TRICK_BONUS, cardPoints } from './cards';
import type { TrickRecord } from './tricks';

export function tallyTricks(
  tricks: readonly TrickRecord[],
  strain: Strain,
  sideOf: (seat: number) => number,
): { cardRaw: number[]; tricksWon: number[] } {
  const cardRaw = [0, 0];
  const tricksWon = [0, 0];
  tricks.forEach((t, i) => {
    const side = sideOf(t.winner);
    tricksWon[side]++;
    cardRaw[side] += t.cards.reduce((s, p) => s + cardPoints(p.card, strain), 0);
    if (i === tricks.length - 1) cardRaw[side] += LAST_TRICK_BONUS;
  });
  return { cardRaw, tricksWon };
}
