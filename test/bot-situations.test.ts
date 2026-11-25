// Positions reported from real games against the strongest (level 10) 2-player bot.

import { describe, expect, it } from 'vitest';
import {
  type Card,
  type Deal2,
  type Strain,
  announce2,
  cardId,
  makeDeck,
  mulberry32,
  newDeclarations,
  parseCards as p,
  play2,
  show2,
  startDeal2,
  startDeal4,
  bazar4,
  trump2,
  declareStage2,
  legalCards2,
} from '../src/engine';
import { botPlay2, botPlay4 } from '../src/bots';

/**
 * A 2-player deal in the middle of play: `hands` are what is left, the other cards were played in
 * earlier tricks or are in the undealt stock. Seat 0 is the human, seat 1 the bot.
 */
function midDeal(opts: {
  trump: Strain;
  taker: number;
  hands: [string, string];
  turn: number;
  trick?: [number, string][];
  /** Who won the earlier tricks (default: alternating). */
  historyWinner?: number;
}): Deal2 {
  const hands = opts.hands.map((h) => p(h));
  const trick = (opts.trick ?? []).map(([seat, c]) => ({ seat, card: p(c)[0] }));
  const inPlay = [...hands.flat(), ...trick.map((x) => x.card)].map(cardId);
  const rest = makeDeck(24).filter((c) => !inPlay.includes(cardId(c)));
  const stock = rest.slice(rest.length - 8);
  const history = rest.slice(0, rest.length - 8);
  const tricks = [];
  for (let i = 0; i + 1 < history.length; i += 2) {
    tricks.push({ cards: [{ seat: 0, card: history[i] }, { seat: 1, card: history[i + 1] }], winner: opts.historyWinner ?? (i % 4 === 0 ? 0 : 1) });
  }
  const decl = newDeclarations([[], []], opts.trump, [0, 1]);
  return {
    ...startDeal2(0, mulberry32(1)),
    phase: 'play',
    hands,
    dealtHands: [],
    turnUp: stock[0],
    stock,
    turn: opts.turn,
    taker: opts.taker,
    trump: opts.trump,
    tookCard: false,
    decl: { ...decl, announced: [[], []] },
    trick,
    tricks,
  };
}


describe('2-player bot (level 10)', () => {
  it('wins the trick with the ace even when the deal is already decided', () => {
    // We took trump but the bot has won every trick so far, so our contract is lost whatever happens.
    // We lead 10♣ holding the trump queen; the bot has 9♣ and A♣ and should still take with the ace.
    const d = midDeal({ trump: 'H', taker: 0, hands: ['QH', '9C AC'], turn: 1, trick: [[0, '10C']], historyWinner: 1 });
    for (let k = 0; k < 5; k++) expect(cardId(botPlay2(d, 1, 10, mulberry32(k)))).toBe('AC');
  });

  it('draws trumps first when it holds the best trump', () => {
    // The bot took trump ♥ and holds J♥ (the best trump); we still hold a trump.
    const d = midDeal({ trump: 'H', taker: 1, hands: ['9H AD QS', 'JH AS KD'], turn: 1 });
    for (let k = 0; k < 5; k++) expect(cardId(botPlay2(d, 1, 10, mulberry32(k)))).toBe('JH');
  });
});

describe('announcement comparison («բոյ»)', () => {
  it('both sides announce: only the stronger one may show', () => {
    // Find a deal where both players hold a combination.
    for (let s = 1; s < 3000; s++) {
      let d = trump2(startDeal2(0, mulberry32(s)), 1, { type: 'take' });
      const det = d.decl!.detected;
      if (!det[0].length || !det[1].length) continue;
      // Seat 1 leads (non-dealer), seat 0 replies; both announce their first combination.
      d = announce2(d, 1, [0]);
      d = play2(d, 1, legalCards2(d, 1)[0]);
      d = announce2(d, 0, [0]);
      d = play2(d, 0, legalCards2(d, 0)[0]);
      expect(d.decl!.leader).not.toBeNull();
      const leader = d.decl!.leader!;
      const loser = 1 - leader;
      // Whoever moves first in trick 2: the loser gets no show option, the leader does.
      if (d.turn === loser) {
        expect(declareStage2(d, loser)).toBeNull();
        d = play2(d, loser, legalCards2(d, loser)[0]);
      }
      expect(declareStage2(d, leader)).toBe('show');
      expect(() => show2(d, leader)).not.toThrow();
      return;
    }
    throw new Error('no deal where both hold a combination');
  });
});


describe('4-player bot reads the bazar (level 10)', () => {
  /**
   * We (seat 0) bid ♥, our partner (seat 2) raised ♥ in the first round — so they hold the J or 9 of
   * hearts; the J is ours, so the 9 is theirs. We lead 8♥. The bot on our left (seat 1) has no hearts
   * and holds A♣: throwing the ace would just give 11 points to our partner's 9♥.
   */
  function raisedDeal() {
    let d = startDeal4(3, mulberry32(5));
    d = bazar4(d, 0, { type: 'bid', bid: { level: 8, strain: 'H', kaput: false } });
    d = bazar4(d, 1, { type: 'pass' });
    d = bazar4(d, 2, { type: 'bid', bid: { level: 9, strain: 'H', kaput: false } });
    for (const seat of [3, 0, 1]) d = bazar4(d, seat, { type: 'pass' });
    d = bazar4(d, 2, { type: 'pass' });
    expect(d.phase).toBe('play');
    const hands = [
      p('JH AS KS QD 7D 8C 7S'), // 8♥ already led
      p('AC 10C KC 9S 8S AD 10D 9D'),
      p('9H 7H QH KH QC JC 8D JD'),
      p('AH 10H 9C 7C 10S QS JS KD'),
    ];
    return {
      ...d,
      hands,
      dealtHands: hands.map((h) => h.slice()),
      decl: { ...newDeclarations(hands, 'H', [0, 1, 0, 1]), announced: [[], [], [], []] },
      trick: [{ seat: 0, card: p('8H')[0] }],
      turn: 1,
    };
  }

  it('does not throw the ace under the raiser’s trump', () => {
    const d = raisedDeal();
    const picks = [0, 1, 2, 3, 4, 5].map((k) => cardId(botPlay4(d, 1, 10, mulberry32(k))));
    expect(picks).not.toContain('AC');
  });
});
