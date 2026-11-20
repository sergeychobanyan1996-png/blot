import { describe, expect, it } from 'vitest';
import { type PlayedCard, cardId, legalCards, parseCards as p, winningIndex } from '../src/engine';

const trick = (...plays: [number, string][]): PlayedCard[] => plays.map(([seat, c]) => ({ seat, card: p(c)[0] }));
const ids = (cards: ReturnType<typeof p>) => cards.map(cardId).sort();
const four = (seat: number) => ({ trump: 'H' as const, partner: (seat + 2) % 4 });

describe('4 players, trump ♥ (RULES Բ3)', () => {
  it('must follow the led suit, no need to beat', () => {
    expect(ids(legalCards(p('7S AS JH 8D'), trick([0, '10S']), four(1)))).toEqual(ids(p('7S AS')));
  });

  it('void in the led suit → must trump', () => {
    expect(ids(legalCards(p('JH 7H 8D'), trick([0, '10S']), four(1)))).toEqual(ids(p('JH 7H')));
  });

  it('opponent trumped, I hold higher trumps → must overtrump', () => {
    expect(ids(legalCards(p('9H 8H 8D'), trick([0, 'AS'], [1, '7H']), four(2)))).toEqual(ids(p('9H 8H')));
  });

  it('opponent trumped, I cannot overtrump → any card', () => {
    expect(ids(legalCards(p('9H 8D'), trick([0, 'AS'], [1, 'JH']), four(2)))).toEqual(ids(p('9H 8D')));
  });

  it('partner is winning → no obligation to trump', () => {
    expect(ids(legalCards(p('7H 8D'), trick([0, 'AS'], [1, '7S']), four(2)))).toEqual(ids(p('7H 8D')));
  });

  it('trump led → must overtrump, even over the partner', () => {
    expect(ids(legalCards(p('JH 8H 7D'), trick([0, '9H'], [1, '7H']), four(2)))).toEqual(ids(p('JH')));
  });

  it('trump led, cannot beat → any trump', () => {
    expect(ids(legalCards(p('7H AS'), trick([0, 'JH']), four(1)))).toEqual(ids(p('7H')));
  });

  it('trump led, no trumps → any card', () => {
    expect(ids(legalCards(p('AS 8D'), trick([0, 'JH']), four(1)))).toEqual(ids(p('AS 8D')));
  });

  it('Բոյ: void → free discard', () => {
    expect(ids(legalCards(p('7H 8D'), trick([0, 'AS']), { trump: null, partner: 3 }))).toEqual(ids(p('7H 8D')));
  });
});

describe('2 players, trump ♥ (RULES Գ3)', () => {
  const two = { trump: 'H' as const, partner: null };
  it('follow suit without beating', () => {
    expect(ids(legalCards(p('KS 7H'), trick([0, 'AS']), two))).toEqual(ids(p('KS')));
  });
  it('void → must trump', () => {
    expect(ids(legalCards(p('7H 9D'), trick([0, 'AS']), two))).toEqual(ids(p('7H')));
  });
  it('trump led → overtrump if possible', () => {
    expect(ids(legalCards(p('9H QH'), trick([0, '10H']), two))).toEqual(ids(p('9H')));
  });
});

describe('trick winner', () => {
  it('lowest trump beats the led suit', () => {
    expect(winningIndex(trick([0, 'AS'], [1, '7H'], [2, 'KS'], [3, '10S']), 'H')).toBe(1);
  });
  it('off-suit card never wins', () => {
    expect(winningIndex(trick([0, '7S'], [1, 'AD'], [2, '8S'], [3, 'AC']), 'H')).toBe(2);
  });
  it('trump order J > 9 > A', () => {
    expect(winningIndex(trick([0, 'AH'], [1, '9H'], [2, 'JH'], [3, '10H']), 'H')).toBe(2);
  });
});
