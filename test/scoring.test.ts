import { describe, expect, it } from 'vitest';
import { type Contract, type ContraLevel, type Strain, matchWinner, roundSmall, score2, score4, targetFor } from '../src/engine';

describe('targets per variant', () => {
  it('2 players: 51 or 101; 4 players: 151 or 301', () => {
    expect(targetFor(2, 51)).toBe(51);
    expect(targetFor(2, 301)).toBe(101);
    expect(targetFor(4, 301)).toBe(301);
    expect(targetFor(4, 101)).toBe(151);
    expect(targetFor(4, undefined)).toBe(151);
  });
});

const contract = (level: number, strain: Strain = 'H', contra: ContraLevel = 0, kaput = false): Contract => ({
  declarer: 0,
  team: 0,
  bid: { level, strain, kaput },
  contra,
});
const tally = (cardRaw: number[], tricksWon: number[], comboRaw = [0, 0], blotRaw = [0, 0]) => ({
  cardRaw,
  tricksWon,
  comboRaw,
  blotRaw,
});

describe('rounding (RULES Ա6)', () => {
  it.each([
    [75, 7],
    [76, 8],
    [70, 7],
    [65, 6],
    [66, 7],
    [0, 0],
    [162, 16],
  ])('%i → %i', (raw, small) => expect(roundSmall(raw)).toBe(small));
});

describe('score4 (RULES Բ6)', () => {
  it('reblot example: «10 հատ սիրտ», 102 vs 60', () => {
    expect(score4(contract(10), tally([102, 60], [5, 3])).points).toEqual([20, 6]);
  });

  it('bonuses count toward the contract', () => {
    const s = score4(contract(11), tally([96, 66], [5, 3], [20, 0], [20, 0]));
    expect(s.made).toBe(true);
    expect(s.points).toEqual([11 + 16 - 7 + 4, 7]);
  });

  it('failed contract: defenders get bid + 16 + all bonuses', () => {
    const s = score4(contract(11), tally([100, 62], [5, 3], [0, 50]));
    expect(s.made).toBe(false);
    expect(s.points).toEqual([0, 11 + 16 + 5]);
  });

  it('contra made: declarer takes everything', () => {
    expect(score4(contract(9, 'H', 1), tally([100, 62], [5, 3], [0, 50])).points).toEqual([9 * 2 + 16 + 5, 0]);
  });

  it('Բոյ doubles the bid', () => {
    expect(score4(contract(8, 'NT'), tally([90, 72], [5, 3])).points).toEqual([16 + 16 - 7, 7]);
  });

  it('Բոյ with սուր failed: ×5', () => {
    expect(score4(contract(8, 'NT', 2), tally([60, 102], [3, 5])).points).toEqual([0, 40 + 16]);
  });

  it('capot without a capot bid: 25 instead of 16', () => {
    const s = score4(contract(8), tally([162, 0], [8, 0]));
    expect(s).toMatchObject({ made: true, kaput: true, points: [8 + 25, 0] });
  });

  it('capot bid needs all 8 tricks', () => {
    const s = score4(contract(26, 'H', 0, true), tally([152, 10], [7, 1], [100, 0]));
    expect(s.made).toBe(false);
    expect(s.points).toEqual([0, 26 + 16 + 10]);
  });

  it('թարս կապուտ: no tricks → failed even with big bonuses', () => {
    const s = score4(contract(8), tally([0, 162], [0, 8], [200, 0]));
    expect(s).toMatchObject({ made: false, tharsKaput: true, points: [0, 8 + 25 + 20] });
  });
});

describe('score2 (RULES Գ5)', () => {
  it('taker gets 16 − opponent (undealt cards included)', () => {
    // akumb example: 102 vs 36, taker has two terzes
    expect(score2(0, tally([102, 36], [6, 2], [40, 0])).points).toEqual([16 - 4 + 4, 4]);
  });

  it('a tie fails the taker', () => {
    const s = score2(0, tally([60, 60], [4, 4]));
    expect(s.made).toBe(false);
    expect(s.points).toEqual([0, 16]);
  });

  it('taker takes all 8 → 21', () => {
    expect(score2(0, tally([100, 0], [8, 0], [0, 50])).points).toEqual([21, 5]);
  });

  it('opponent takes all 8 → 21 + all bonuses', () => {
    expect(score2(0, tally([0, 100], [0, 8], [0, 0], [20, 0])).points).toEqual([0, 23]);
  });
});

describe('match end (RULES Բ7)', () => {
  const base = { target: 101, bidder: 0, made: true };
  it('first to the target wins', () => {
    expect(matchWinner({ ...base, before: [95, 40], after: [105, 40] })).toBe(0);
  });
  it('both past the target: higher wins, equal continues', () => {
    expect(matchWinner({ ...base, before: [90, 95], after: [110, 105] })).toBe(0);
    expect(matchWinner({ ...base, before: [90, 95], after: [105, 105] })).toBeNull();
  });
  it('team at the target that fails its own contract cannot win', () => {
    expect(matchWinner({ ...base, made: false, before: [105, 105], after: [105, 130] })).toBe(1);
    expect(matchWinner({ ...base, made: false, before: [105, 70], after: [105, 100] })).toBeNull();
  });
  it('թարս կապուտ loses immediately', () => {
    expect(matchWinner({ ...base, made: false, tharsKaput: true, before: [100, 0], after: [100, 33] })).toBe(1);
  });
  it('a capot does not end the match unless contra’d', () => {
    expect(matchWinner({ ...base, kaputNoEnd: true, before: [80, 0], after: [113, 0] })).toBeNull();
  });
});
