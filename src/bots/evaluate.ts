// Rough hand evaluation in raw points, used by the bidding bots.

import { type Card, type Strain, SUITS, cardPoints } from '../engine/cards';
import { findCombos, hasBlot } from '../engine/combos';

const has = (hand: readonly Card[], suit: string, rank: string) => hand.some((c) => c.suit === suit && c.rank === rank);

/** Points this hand is likely to bring in by itself (no partner), bonuses included. */
export function handStrength(hand: readonly Card[], strain: Strain): number {
  let e = 0;
  if (strain === 'NT') {
    for (const suit of SUITS) {
      const n = hand.filter((c) => c.suit === suit).length;
      if (has(hand, suit, 'A')) {
        e += 19;
        if (has(hand, suit, '10')) e += 10 + (has(hand, suit, 'K') ? 4 : 0);
        if (n >= 5) e += 10;
      } else if (has(hand, suit, '10') && n >= 3) e += 3;
      if (n === 0) e -= 8; // a void is a liability without trumps
    }
  } else {
    const trumps = hand.filter((c) => c.suit === strain);
    e += trumps.reduce((s, c) => s + cardPoints(c, strain), 0);
    e += Math.max(0, trumps.length - 2) * 10;
    if (!has(hand, strain, 'J')) e -= has(hand, strain, '9') ? 10 : 25;
    for (const suit of SUITS) {
      if (suit === strain) continue;
      if (has(hand, suit, 'A')) e += 11 + (has(hand, suit, '10') ? 10 : 0);
      else if (hand.filter((c) => c.suit === suit).length === 0) e += 5; // void: ruffing chance
    }
    if (hasBlot(hand, strain)) e += 20;
  }
  e += findCombos(hand, strain).reduce((s, c) => s + c.value, 0) * 0.8;
  return e;
}

/** How much of the opponents' contract this hand can stop (defensive tricks). */
export function defenseStrength(hand: readonly Card[], strain: Strain): number {
  let e = 0;
  for (const c of hand) {
    if (strain !== 'NT' && c.suit === strain) e += c.rank === 'J' ? 20 : c.rank === '9' ? 12 : 3;
    else if (c.rank === 'A') e += strain === 'NT' ? 19 : 11;
    else if (c.rank === '10') e += 4;
  }
  return e;
}
