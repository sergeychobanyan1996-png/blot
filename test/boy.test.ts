import { describe, expect, it } from 'vitest';
import { parseCards } from '../src/engine/cards';
import { announce, newDeclarations, settleAnnouncements } from '../src/engine/declare';

// Seats 0 and 1 are opponents (2 players); seat 0 plays first.
const settle = (h0: string, h1: string, strain: 'H' | 'S' | 'NT' = 'H') => {
  let d = newDeclarations([parseCards(h0), parseCards(h1)], strain, [0, 1]);
  for (const seat of [0, 1]) if (d.detected[seat].length) d = announce(d, seat, d.detected[seat].map((_, i) => i), 0);
  return settleAnnouncements(d, strain, [0, 1]);
};

describe('«բոյ» question', () => {
  it('is not asked when the classes differ', () => {
    const d = settle('7S 8S 9S', '7C 8C 9C 10C');
    expect(d.boyTalk).toBeNull();
    expect(d.leader).toBe(1);
  });

  it('is not asked when only one side announced', () => {
    expect(settle('7S 8S 9S', '7C 9D JH').boyTalk).toBeNull();
  });

  it('the side that announced second names its top card first', () => {
    const d = settle('8S 9S 10S', 'QC KC AC');
    expect(d.boyTalk).toEqual([
      { seat: 1, top: 'A', trump: false, wins: true },
      { seat: 0, top: '10', trump: false, wins: false },
    ]);
    expect(d.leader).toBe(1);
  });

  it('mentions trump only when the top cards are equal', () => {
    const d = settle('8S 9S 10S', '8H 9H 10H');
    expect(d.boyTalk).toEqual([
      { seat: 1, top: '10', trump: true, wins: true },
      { seat: 0, top: '10', trump: false, wins: false },
    ]);
  });
});
