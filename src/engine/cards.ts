// Cards, rank order and card values — RULES.md Ա1–Ա2.

export const SUITS = ['S', 'H', 'D', 'C'] as const; // ♠ քյափ, ♥ սիրտ, ♦ ղառ, ♣ խաչ
export type Suit = (typeof SUITS)[number];

/** Natural order, used for sequences (7-8-9-10-J-Q-K-A). */
export const RANKS = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
export type Rank = (typeof RANKS)[number];

export interface Card {
  readonly suit: Suit;
  readonly rank: Rank;
}

/** Contract strain: a trump suit or 'NT' (Բոյ, no trump). */
export type Strain = Suit | 'NT';

export const LAST_TRICK_BONUS = 10;

export const cardId = (c: Card): string => `${c.rank}${c.suit}`;
export const sameCard = (a: Card, b: Card): boolean => a.suit === b.suit && a.rank === b.rank;

/** 32 cards (7–A) for Բազառ-Բլոտ, 24 cards (9–A) for 2-player Բլոտ. */
export function makeDeck(size: 32 | 24): Card[] {
  const ranks = size === 32 ? RANKS : RANKS.slice(2);
  return SUITS.flatMap((suit) => ranks.map((rank) => ({ suit, rank })));
}

// Weakest → strongest.
const PLAIN_ORDER: readonly Rank[] = ['7', '8', '9', 'J', 'Q', 'K', '10', 'A'];
const TRUMP_ORDER: readonly Rank[] = ['7', '8', 'Q', 'K', '10', 'A', '9', 'J'];

/** Strength of a card within its own suit; higher wins. */
export function rankStrength(rank: Rank, isTrump: boolean): number {
  return (isTrump ? TRUMP_ORDER : PLAIN_ORDER).indexOf(rank);
}

export const naturalIndex = (rank: Rank): number => RANKS.indexOf(rank);

const PLAIN_POINTS: Record<Rank, number> = { '7': 0, '8': 0, '9': 0, '10': 10, J: 2, Q: 3, K: 4, A: 11 };
const TRUMP_POINTS: Record<Rank, number> = { '7': 0, '8': 0, '9': 14, '10': 10, J: 20, Q: 3, K: 4, A: 11 };
const NT_POINTS: Record<Rank, number> = { '7': 0, '8': 0, '9': 0, '10': 10, J: 2, Q: 3, K: 4, A: 19 };

export function cardPoints(card: Card, strain: Strain): number {
  if (strain === 'NT') return NT_POINTS[card.rank];
  return card.suit === strain ? TRUMP_POINTS[card.rank] : PLAIN_POINTS[card.rank];
}

export const trumpOf = (strain: Strain): Suit | null => (strain === 'NT' ? null : strain);

/** Test/debug helper: parseCards('JH 9H 10S') */
export function parseCards(text: string): Card[] {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const suit = token.slice(-1) as Suit;
      const rank = token.slice(0, -1) as Rank;
      if (!SUITS.includes(suit) || !RANKS.includes(rank)) throw new Error(`Bad card: ${token}`);
      return { suit, rank };
    });
}
