// Announcing and showing combinations — RULES.md Ա5.
// Before their first card a player announces any of their combinations; before their second card
// they show what they announced. Only shown combinations take part in the comparison (Ա4);
// a player who plays the second card without showing loses them. Բլոտ is called while playing.

import type { Card, Strain } from './cards';
import { type Combo, type ComboResolution, compareCombos, findBlotSeat, findCombos } from './combos';

export interface Declarations {
  /** Combinations found in each dealt hand (private to that seat). */
  detected: Combo[][];
  /** What each seat announced; null while still undecided on the first trick. */
  announced: (Combo[] | null)[];
  shown: Combo[][];
  /** Holder of trump K + Q (private until those cards are played). */
  blotSeat: number | null;
}

export type DeclareStage = 'announce' | 'show' | null;

export function newDeclarations(hands: readonly (readonly Card[])[], strain: Strain): Declarations {
  return {
    detected: hands.map((h) => findCombos(h, strain)),
    announced: hands.map(() => null),
    shown: hands.map(() => []),
    blotSeat: findBlotSeat(hands, strain),
  };
}

/** What `seat` may do with its combinations before playing its card now. */
export function declareStage(d: Declarations, seat: number, tricksDone: number): DeclareStage {
  if (tricksDone === 0 && d.announced[seat] === null && d.detected[seat].length > 0) return 'announce';
  if (tricksDone === 1 && (d.announced[seat]?.length ?? 0) > 0 && d.shown[seat].length === 0) return 'show';
  return null;
}

/** Announce the detected combinations at the given indexes (an empty list announces nothing). */
export function announce(d: Declarations, seat: number, picks: readonly number[], tricksDone: number): Declarations {
  if (declareStage(d, seat, tricksDone) !== 'announce') throw new Error('Cannot announce now');
  const unique = [...new Set(picks)];
  if (unique.some((i) => !Number.isInteger(i) || !d.detected[seat][i])) throw new Error('Unknown combination');
  const announced = d.announced.slice();
  announced[seat] = unique.sort((a, b) => a - b).map((i) => d.detected[seat][i]);
  return { ...d, announced };
}

export function show(d: Declarations, seat: number, tricksDone: number): Declarations {
  if (declareStage(d, seat, tricksDone) !== 'show') throw new Error('Cannot show now');
  const shown = d.shown.slice();
  shown[seat] = d.announced[seat]!;
  return { ...d, shown };
}

/** Playing a card closes the chance to announce (first trick); showing is simply skipped. */
export function beforePlay(d: Declarations, seat: number, tricksDone: number): Declarations {
  if (tricksDone !== 0 || d.announced[seat] !== null) return d;
  const announced = d.announced.slice();
  announced[seat] = [];
  return { ...d, announced };
}

export function resolveDeclared(
  d: Declarations,
  strain: Strain,
  order: readonly number[],
  teamOf: (seat: number) => number,
  teamCount: number,
): ComboResolution {
  return compareCombos(d.shown, strain, order, teamOf, teamCount, d.blotSeat);
}
