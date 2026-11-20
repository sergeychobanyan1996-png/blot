import { describe, expect, it } from 'vitest';
import {
  type Strain,
  cardPoints,
  findCarres,
  findSequences,
  makeDeck,
  parseCards as p,
  resolveCombos,
  teamOf4,
} from '../src/engine';

describe('cards', () => {
  it('deck sizes', () => {
    expect(makeDeck(32)).toHaveLength(32);
    expect(makeDeck(24)).toHaveLength(24);
  });

  it.each<Strain>(['H', 'S', 'NT'])('card points total 152 for %s', (strain) => {
    const sum = (n: 32 | 24) => makeDeck(n).reduce((s, c) => s + cardPoints(c, strain), 0);
    expect(sum(32)).toBe(152);
    if (strain !== 'NT') expect(sum(24)).toBe(152);
  });
});

describe('sequences', () => {
  it('finds a terz and a fifty in one suit', () => {
    const seqs = findSequences(p('7H 8H 9H JH QH KH AH 10S'));
    expect(seqs.map((s) => (s.kind === 'seq' ? [s.length, s.value, s.top] : null))).toEqual([
      [3, 20, '9'],
      [4, 50, 'A'],
    ]);
  });

  it('5 or more in a row is a single 100', () => {
    expect(findSequences(p('7D 8D 9D 10D JD QD')).map((s) => s.value)).toEqual([100]);
  });
});

describe('four of a kind', () => {
  const jacks = p('JS JH JD JC');
  it('values by contract', () => {
    expect(findCarres(jacks, 'H')[0].value).toBe(200);
    expect(findCarres(jacks, 'NT')[0].value).toBe(100);
    expect(findCarres(p('9S 9H 9D 9C'), 'NT')).toEqual([]);
    expect(findCarres(p('AS AH AD AC'), 'NT')[0].value).toBe(190);
    expect(findCarres(p('8S 8H 8D 8C'), 'H')).toEqual([]);
  });
});

describe('combination comparison', () => {
  const order = [1, 2, 3, 0]; // dealer 0
  const resolve = (hands: string[], strain: Strain) => resolveCombos(hands.map((h) => p(h)), strain, order, teamOf4, 2);

  it('higher top card beats a trump sequence', () => {
    const r = resolve(['7C', 'AS KS QS', 'JH 10H 9H', '7D'], 'H');
    expect(r.bestSeat).toBe(1);
    expect(r.comboRaw).toEqual([0, 20]);
  });

  it('equal top card: trump wins', () => {
    const r = resolve(['7C', 'AS KS QS', 'AH KH QH', '7D'], 'H');
    expect(r.bestSeat).toBe(2);
    expect(r.comboRaw).toEqual([20, 0]);
  });

  it('full tie goes to the first player after the dealer', () => {
    const r = resolve(['7C', 'JS QS KS', 'JD QD KD', '7D'], 'H');
    expect(r.bestSeat).toBe(1);
  });

  it('four of a kind beats a 100 of equal value', () => {
    const r = resolve(['QS QH QD QC', '7D 8D 9D 10D JD', '7C', '8C'], 'H');
    expect(r.winnerTeam).toBe(0);
    expect(r.comboRaw).toEqual([100, 0]);
  });

  it('winning team scores all its combinations, Բլոտ always counts', () => {
    const r = resolve(['AS KS QS', 'JD QD KD', '7C 8C 9C', 'KH QH 7H'], 'H');
    // seat 0 (A-K-Q) is best → team 0 scores both its terzes; team 1 has Բլոտ (seat 3)
    expect(r.comboRaw).toEqual([40, 0]);
    expect(r.blotRaw).toEqual([0, 20]);
    expect(r.blotSeat).toBe(3);
  });

  it('no Բլոտ in Բոյ', () => {
    expect(resolve(['KH QH', '7C', '8C', '9C'], 'NT').blotRaw).toEqual([0, 0]);
  });
});
