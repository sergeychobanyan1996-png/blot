// Trick play: legal cards and trick winner — RULES.md Բ3 (4 players) and Գ3 (2 players).

import { type Card, type Suit, rankStrength } from './cards';

export interface PlayedCard {
  seat: number;
  card: Card;
}

export interface TrickRecord {
  cards: PlayedCard[];
  winner: number;
}

function beats(a: Card, b: Card, trump: Suit | null): boolean {
  if (trump && a.suit === trump && b.suit !== trump) return true;
  if (a.suit !== b.suit) return false;
  return rankStrength(a.rank, a.suit === trump) > rankStrength(b.rank, b.suit === trump);
}

/** Index (into the trick) of the card currently winning it. */
export function winningIndex(trick: readonly PlayedCard[], trump: Suit | null): number {
  let best = 0;
  for (let i = 1; i < trick.length; i++) {
    if (beats(trick[i].card, trick[best].card, trump)) best = i;
  }
  return best;
}

export interface LegalContext {
  trump: Suit | null;
  /** Partner's seat in the 4-player game; null in the 2-player game. */
  partner: number | null;
}

export function legalCards(hand: readonly Card[], trick: readonly PlayedCard[], ctx: LegalContext): Card[] {
  if (trick.length === 0) return hand.slice();
  const { trump, partner } = ctx;
  const led = trick[0].card.suit;
  const followers = hand.filter((c) => c.suit === led);
  const highestTrumpOnTable = Math.max(
    -1,
    ...trick.filter((p) => p.card.suit === trump).map((p) => rankStrength(p.card.rank, true)),
  );
  const higherTrumps = (cards: Card[]) => cards.filter((c) => rankStrength(c.rank, true) > highestTrumpOnTable);

  // Trump led: overtrump if you can (even over your partner), else any trump, else anything.
  if (trump && led === trump) {
    if (followers.length === 0) return hand.slice();
    const higher = higherTrumps(followers);
    return higher.length ? higher : followers;
  }

  // Follow the led suit; no obligation to beat it.
  if (followers.length) return followers;
  if (!trump) return hand.slice(); // Բոյ: free discard

  const trumps = hand.filter((c) => c.suit === trump);
  if (trumps.length === 0) return hand.slice();

  // Partner already winning → no obligation to trump (չախել).
  if (partner !== null && trick[winningIndex(trick, trump)].seat === partner) return hand.slice();

  // An opponent has trumped: overtrump if you can, otherwise play anything.
  if (highestTrumpOnTable >= 0) {
    const higher = higherTrumps(trumps);
    return higher.length ? higher : hand.slice();
  }
  return trumps;
}

export const isLegal = (card: Card, hand: readonly Card[], trick: readonly PlayedCard[], ctx: LegalContext): boolean =>
  legalCards(hand, trick, ctx).some((c) => c.suit === card.suit && c.rank === card.rank);
