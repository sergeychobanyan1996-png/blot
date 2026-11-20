// What a bot can know about hidden cards: voids shown by play, and random hands consistent with them.

import { type Card, type Suit, sameCard } from '../engine/cards';
import { type PlayedCard, winningIndex } from '../engine/tricks';
import { type Rng, shuffle } from '../engine/rng';

export const without = (cards: readonly Card[], remove: readonly Card[]): Card[] =>
  cards.filter((c) => !remove.some((r) => sameCard(r, c)));

/**
 * Suits each seat is known to lack, from tricks played so far (completed and current).
 * Not following the led suit → void in it; not trumping when obliged → void in trump.
 */
export function inferVoids(
  seats: number,
  tricks: readonly (readonly PlayedCard[])[],
  trump: Suit | null,
  partnerOf: (seat: number) => number | null,
): Set<Suit>[] {
  const voids = Array.from({ length: seats }, () => new Set<Suit>());
  for (const trick of tricks) {
    if (trick.length === 0) continue;
    const led = trick[0].card.suit;
    for (let i = 1; i < trick.length; i++) {
      const { seat, card } = trick[i];
      if (card.suit === led) continue;
      voids[seat].add(led);
      if (!trump || led === trump || card.suit === trump) continue;
      const before = trick.slice(0, i);
      const winner = before[winningIndex(before, trump)].seat;
      const trumpOnTable = before.some((p) => p.card.suit === trump);
      // With no trump on the table and an opponent winning, a ruff was compulsory.
      if (!trumpOnTable && winner !== partnerOf(seat)) voids[seat].add(trump);
    }
  }
  return voids;
}

/**
 * Deals `pool` into slots of the given sizes. `fixed[slot]` cards (must be in the pool) go to that slot;
 * a slot never receives a suit in `voids[slot]`. `accept` can reject unlikely layouts (bidding inference).
 */
export function sampleHands(
  pool: readonly Card[],
  counts: readonly number[],
  voids: readonly Set<Suit>[],
  fixed: readonly (readonly Card[])[],
  rng: Rng,
  accept?: (hands: Card[][]) => boolean,
): Card[][] {
  const fixedAll = fixed.flat();
  const free = without(pool, fixedAll);
  let fallback: Card[][] | null = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    const hands = fixed.map((f) => f.slice());
    const caps = counts.map((n, i) => n - fixed[i].length);
    const cards = shuffle(free, rng);
    const eligible = (c: Card) => caps.map((_, i) => i).filter((i) => !voids[i]?.has(c.suit));
    cards.sort((a, b) => eligible(a).length - eligible(b).length);
    let ok = true;
    for (const c of cards) {
      const slots = eligible(c).filter((i) => caps[i] > 0);
      const total = slots.reduce((s, i) => s + caps[i], 0);
      if (total === 0) {
        ok = false;
        break;
      }
      let r = rng() * total;
      let slot = slots[0];
      for (const i of slots) {
        r -= caps[i];
        if (r < 0) {
          slot = i;
          break;
        }
      }
      hands[slot].push(c);
      caps[slot]--;
    }
    if (!ok) continue;
    if (!accept || accept(hands)) return hands;
    fallback ??= hands;
  }
  if (fallback) return fallback;
  // Inconsistent constraints (should not happen): ignore voids.
  const cards = shuffle(free, rng);
  const hands = fixed.map((f) => f.slice());
  counts.forEach((n, i) => hands[i].push(...cards.splice(0, n - fixed[i].length)));
  return hands;
}
