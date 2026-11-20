// Bot players for both variants. Each function returns a legal move for the given seat.
// Levels 1–4 use fixed rules with a chance of a random (legal) move; levels 5–10 run Monte Carlo
// playouts (see strong.ts) with more samples at each level.

import { type Card, type Strain, type Suit, makeDeck } from '../engine/cards';
import { without } from './knowledge';
import { type BazarAction, type BazarState, MAX_LEVEL, bazarOptions, teamOf4 } from '../engine/bazar';
import { type Deal4, legalCards4, partnerOf4 } from '../engine/deal4';
import { type Deal2, type TrumpAction, legalCards2, trumpOptions2 } from '../engine/deal2';
import { type Rng, mulberry32 } from '../engine/rng';
import { defenseStrength, handStrength } from './evaluate';
import { choosePlay } from './play';
import { type Samples, strongBazar4, strongPlay2, strongPlay4, strongTrump2 } from './strong';

export type BotLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export const BOT_LEVELS: BotLevel[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const DEFAULT_LEVEL: BotLevel = 7;

interface LevelSpec {
  /** Probability of making a random legal move instead of the considered one. */
  noise: number;
  /** Monte Carlo samples, or null for the rule-based bot. */
  mc: Samples | null;
}

const LEVELS: Record<BotLevel, LevelSpec> = {
  1: { noise: 1, mc: null },
  2: { noise: 0.45, mc: null },
  3: { noise: 0.2, mc: null },
  4: { noise: 0, mc: null },
  5: { noise: 0.12, mc: { play: 8, bid: 10, trump: 16 } },
  6: { noise: 0.06, mc: { play: 10, bid: 12, trump: 20 } },
  7: { noise: 0, mc: { play: 14, bid: 16, trump: 24 } },
  8: { noise: 0, mc: { play: 24, bid: 24, trump: 40 } },
  9: { noise: 0, mc: { play: 50, bid: 40, trump: 80 } },
  10: { noise: 0, mc: { play: 100, bid: 70, trump: 140 } },
};

/** Accepts saved values from older versions ('easy' / 'strong') and anything out of range. */
export function toLevel(v: unknown): BotLevel {
  if (v === 'easy') return 4;
  if (v === 'strong') return 9;
  const n = Math.round(Number(v));
  return (n >= 1 && n <= 10 ? n : DEFAULT_LEVEL) as BotLevel;
}

const randomRng = (): Rng => mulberry32(Math.floor(Math.random() * 2 ** 32));
const pick = <T>(items: readonly T[], rng: Rng): T => items[Math.floor(rng() * items.length)];
const blunders = (level: BotLevel, rng: Rng) => rng() < LEVELS[level].noise;

const STRAINS: Strain[] = ['S', 'H', 'D', 'C', 'NT'];
/** Assumed contribution of an unknown partner, in raw points. */
const PARTNER_SHARE = 25;

/** A random but legal bazar move: mostly «Լավ եմ», sometimes a low bid. */
function randomBazar(b: BazarState, seat: number, rng: Rng): BazarAction | null {
  const o = bazarOptions(b, seat);
  if (b.phase === 'awaitSur') {
    if (!o.sur || seat !== b.current!.seat) return null;
    return rng() < 0.3 ? { type: 'sur' } : { type: 'pass' };
  }
  if (seat !== b.turn) return null;
  if (o.contra && rng() < 0.05) return { type: 'contra' };
  if (o.minLevel !== null && o.minLevel <= 16 && rng() < 0.3) {
    const level = Math.min(MAX_LEVEL, o.minLevel + (o.sameLevelChange ? 1 : 0) + Math.floor(rng() * 2));
    return { type: 'bid', bid: { level, strain: pick(STRAINS, rng), kaput: o.mustKaput } };
  }
  return { type: 'pass' };
}

/** Returns null when this seat has nothing to do in the bazar right now. */
export function botBazar4(
  b: BazarState,
  seat: number,
  hand: readonly Card[],
  level: BotLevel = 4,
  rng: Rng = randomRng(),
): BazarAction | null {
  if (blunders(level, rng)) return randomBazar(b, seat, rng);
  const mc = LEVELS[level].mc;
  if (mc) return strongBazar4(b, seat, hand, rng, mc.bid);
  const o = bazarOptions(b, seat);
  if (b.phase === 'awaitSur') {
    if (!o.sur || seat !== b.current!.seat) return null;
    const { level: bid, strain } = b.current!.bid;
    return handStrength(hand, strain) + PARTNER_SHARE >= (bid + 3) * 10 ? { type: 'sur' } : { type: 'pass' };
  }
  if (seat !== b.turn) return null;

  if (o.contra && b.current) {
    const { level: bid, strain } = b.current.bid;
    if (bid >= 10 && bid * 10 + defenseStrength(hand, strain) + PARTNER_SHARE > 175) return { type: 'contra' };
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

export function botPlay4(d: Deal4, seat: number, level: BotLevel = 4, rng: Rng = randomRng()): Card {
  const legal = legalCards4(d, seat);
  if (blunders(level, rng)) return pick(legal, rng);
  const mc = LEVELS[level].mc;
  if (mc) return strongPlay4(d, seat, rng, mc.play);
  const c = d.contract!;
  const played = [...d.tricks.flatMap((t) => t.cards), ...d.trick].map((p) => p.card);
  return choosePlay({
    hand: d.hands[seat],
    legal,
    trick: d.trick,
    strain: c.bid.strain,
    seat,
    partner: partnerOf4(seat),
    trickSize: 4,
    attacking: teamOf4(seat) === c.team,
    unseen: without(without(makeDeck(32), d.hands[seat]), played),
  });
}

const TAKE_THRESHOLD = 40; // raw points in the first five cards

export function botTrump2(d: Deal2, seat: number, level: BotLevel = 4, rng: Rng = randomRng()): TrumpAction {
  const o = trumpOptions2(d, seat);
  if (blunders(level, rng)) {
    const choices: TrumpAction[] = [
      ...(o.take ? [{ type: 'take' } as const] : []),
      ...(o.pass ? [{ type: 'pass' } as const] : []),
      ...o.name.map((suit) => ({ type: 'name', suit }) as const),
    ];
    return pick(choices, rng);
  }
  const mc = LEVELS[level].mc;
  if (mc) return strongTrump2(d, seat, rng, mc.trump);
  const hand = d.hands[seat];
  if (o.take) return handStrength(hand, d.turnUp.suit) >= TAKE_THRESHOLD ? { type: 'take' } : { type: 'pass' };
  let best: Suit = o.name[0];
  for (const s of o.name) if (handStrength(hand, s) > handStrength(hand, best)) best = s;
  if (o.pass && handStrength(hand, best) < TAKE_THRESHOLD) return { type: 'pass' };
  return { type: 'name', suit: best };
}

export function botPlay2(d: Deal2, seat: number, level: BotLevel = 4, rng: Rng = randomRng()): Card {
  const legal = legalCards2(d, seat);
  if (blunders(level, rng)) return pick(legal, rng);
  const mc = LEVELS[level].mc;
  if (mc) return strongPlay2(d, seat, rng, mc.play);
  const played = [...d.tricks.flatMap((t) => t.cards), ...d.trick].map((p) => p.card);
  return choosePlay({
    hand: d.hands[seat],
    legal,
    trick: d.trick,
    strain: d.trump!,
    seat,
    partner: null,
    trickSize: 2,
    attacking: seat === d.taker,
    // The turned card stays in the undealt stock, so it is never out against us.
    unseen: without(without(makeDeck(24), [...d.hands[seat], d.turnUp]), played),
  });
}
