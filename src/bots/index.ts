// Bot players for both variants. Each function returns a legal move for the given seat.
// 'easy' bots use fixed rules; 'strong' bots run Monte Carlo playouts (see strong.ts).

import type { Card, Strain, Suit } from '../engine/cards';
import { type BazarAction, type BazarState, bazarOptions, teamOf4 } from '../engine/bazar';
import { type Deal4, legalCards4, partnerOf4 } from '../engine/deal4';
import { type Deal2, type TrumpAction, legalCards2, trumpOptions2 } from '../engine/deal2';
import { type Rng, mulberry32 } from '../engine/rng';
import { defenseStrength, handStrength } from './evaluate';
import { choosePlay } from './play';
import { strongBazar4, strongPlay2, strongPlay4, strongTrump2 } from './strong';

export type BotLevel = 'easy' | 'strong';
const randomRng = (): Rng => mulberry32(Math.floor(Math.random() * 2 ** 32));

const STRAINS: Strain[] = ['S', 'H', 'D', 'C', 'NT'];
/** Assumed contribution of an unknown partner, in raw points. */
const PARTNER_SHARE = 25;

/** Returns null when this seat has nothing to do in the bazar right now. */
export function botBazar4(
  b: BazarState,
  seat: number,
  hand: readonly Card[],
  level: BotLevel = 'easy',
  rng: Rng = randomRng(),
): BazarAction | null {
  if (level === 'strong') return strongBazar4(b, seat, hand, rng);
  const o = bazarOptions(b, seat);
  if (b.phase === 'awaitSur') {
    if (!o.sur || seat !== b.current!.seat) return null;
    const { level, strain } = b.current!.bid;
    return handStrength(hand, strain) + PARTNER_SHARE >= (level + 3) * 10 ? { type: 'sur' } : { type: 'pass' };
  }
  if (seat !== b.turn) return null;

  if (o.contra && b.current) {
    const { level, strain } = b.current.bid;
    if (level >= 10 && level * 10 + defenseStrength(hand, strain) + PARTNER_SHARE > 175) return { type: 'contra' };
  }
  if (b.phase === 'lastBidderOption' || o.minLevel === null || o.mustKaput) return { type: 'pass' };

  let best: Strain = 'H';
  let bestValue = -Infinity;
  for (const strain of STRAINS) {
    // Բոյ doubles the bid, so it needs a clearly better hand.
    const v = handStrength(hand, strain) - (strain === 'NT' ? 10 : 0);
    if (v > bestValue) [best, bestValue] = [strain, v];
  }
  const reach = Math.floor((bestValue + PARTNER_SHARE) / 10);
  const partnerHolds = b.current !== null && teamOf4(b.current.seat) === teamOf4(seat);
  const needed = o.minLevel + (partnerHolds ? 1 : 0);
  if (reach < needed) return { type: 'pass' };
  return { type: 'bid', bid: { level: o.minLevel, strain: best, kaput: false } };
}

export function botPlay4(d: Deal4, seat: number, level: BotLevel = 'easy', rng: Rng = randomRng()): Card {
  if (level === 'strong') return strongPlay4(d, seat, rng);
  const c = d.contract!;
  return choosePlay({
    hand: d.hands[seat],
    legal: legalCards4(d, seat),
    trick: d.trick,
    strain: c.bid.strain,
    seat,
    partner: partnerOf4(seat),
    trickSize: 4,
    attacking: teamOf4(seat) === c.team,
  });
}

const TAKE_THRESHOLD = 40; // raw points in the first five cards

export function botTrump2(d: Deal2, seat: number, level: BotLevel = 'easy', rng: Rng = randomRng()): TrumpAction {
  if (level === 'strong') return strongTrump2(d, seat, rng);
  const o = trumpOptions2(d, seat);
  const hand = d.hands[seat];
  if (o.take) return handStrength(hand, d.turnUp.suit) >= TAKE_THRESHOLD ? { type: 'take' } : { type: 'pass' };
  let best: Suit = o.name[0];
  for (const s of o.name) if (handStrength(hand, s) > handStrength(hand, best)) best = s;
  if (o.pass && handStrength(hand, best) < TAKE_THRESHOLD) return { type: 'pass' };
  return { type: 'name', suit: best };
}

export function botPlay2(d: Deal2, seat: number, level: BotLevel = 'easy', rng: Rng = randomRng()): Card {
  if (level === 'strong') return strongPlay2(d, seat, rng);
  return choosePlay({
    hand: d.hands[seat],
    legal: legalCards2(d, seat),
    trick: d.trick,
    strain: d.trump!,
    seat,
    partner: null,
    trickSize: 2,
    attacking: seat === d.taker,
  });
}
