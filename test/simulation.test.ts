// Random players through whole deals and matches: no illegal states, invariants hold, matches end.

import { describe, expect, it } from 'vitest';
import {
  type BazarAction,
  type Deal2,
  type Deal4,
  type Match2,
  type Match4,
  type Rng,
  type Strain,
  bazar4,
  bazarOptions,
  cardPoints,
  legalCards2,
  legalCards4,
  mulberry32,
  newMatch2,
  newMatch4,
  play2,
  play4,
  playMove2,
  playMove4,
  startDeal2,
  startDeal4,
  trump2,
  trumpMove2,
  trumpOptions2,
  bazarMove4,
  announce4,
  cardId,
  declareStage4,
  show4,
} from '../src/engine';

const STRAINS: Strain[] = ['S', 'H', 'D', 'C', 'NT'];
const pick = <T>(items: readonly T[], rng: Rng): T => items[Math.floor(rng() * items.length)];

function randomBazar(d: Deal4, rng: Rng): [number, BazarAction] {
  const b = d.bazar;
  if (b.phase === 'awaitSur') {
    const seat = b.current!.seat;
    return [seat, rng() < 0.3 ? { type: 'sur' } : { type: 'pass' }];
  }
  const opponent = (d.bazar.current?.seat ?? 0) % 2 === 0 ? 1 : 0;
  if (b.current && b.contra === 0 && rng() < 0.03) return [opponent, { type: 'contra' }];
  const o = bazarOptions(b, b.turn);
  if (o.minLevel !== null && o.minLevel <= 18 && rng() < 0.3) {
    const kaput = o.mustKaput || rng() < 0.02;
    const level = o.sameLevelChange ? o.minLevel + 1 : o.minLevel;
    return [b.turn, { type: 'bid', bid: { level, strain: pick(STRAINS, rng), kaput } }];
  }
  return [b.turn, { type: 'pass' }];
}

function randomTrump(d: Deal2, rng: Rng): Parameters<typeof trump2>[2] {
  const o = trumpOptions2(d, d.turn);
  if (o.take && rng() < 0.4) return { type: 'take' };
  if (o.name.length && (!o.pass || rng() < 0.4)) return { type: 'name', strain: pick(o.name, rng), takeCard: rng() < 0.5 };
  return { type: 'pass' };
}

describe('4-player deals', () => {
  it('500 random deals keep the invariants', () => {
    let finished = 0;
    for (let i = 0; i < 500; i++) {
      const rng = mulberry32(i + 1);
      let d = startDeal4(i % 4, rng);
      while (d.phase === 'bazar') d = bazar4(d, ...randomBazar(d, rng));
      if (d.phase === 'redeal') continue;
      while (d.phase === 'play') {
        const legal = legalCards4(d, d.turn);
        expect(legal.length).toBeGreaterThan(0);
        d = play4(d, d.turn, pick(legal, rng));
      }
      finished++;
      expect(d.hands.every((h) => h.length === 0)).toBe(true);
      expect(d.tally!.cardRaw[0] + d.tally!.cardRaw[1]).toBe(162);
      expect(d.tally!.tricksWon[0] + d.tally!.tricksWon[1]).toBe(8);
      expect(d.score!.points.every((v) => Number.isInteger(v) && v >= 0)).toBe(true);
    }
    expect(finished).toBeGreaterThan(100);
  });

  it('rejects playing out of turn', () => {
    const rng = mulberry32(7);
    let d = startDeal4(0, rng);
    d = bazar4(d, 1, { type: 'bid', bid: { level: 8, strain: 'H', kaput: false } });
    for (const seat of [2, 3, 0, 1]) d = bazar4(d, seat, { type: 'pass' });
    expect(d.phase).toBe('play');
    expect(d.turn).toBe(1);
    expect(() => play4(d, 2, d.hands[2][0])).toThrow();
  });
});

describe('2-player deals', () => {
  it('500 random deals keep the invariants', () => {
    for (let i = 0; i < 500; i++) {
      const rng = mulberry32(1000 + i);
      let d = startDeal2(i % 2, rng);
      while (d.phase === 'trump1' || d.phase === 'trump2') d = trump2(d, d.turn, randomTrump(d, rng));
      expect(d.hands.map((h) => h.length)).toEqual([8, 8]);
      expect(d.stock).toHaveLength(8);
      while (d.phase === 'play') d = play2(d, d.turn, pick(legalCards2(d, d.turn), rng));
      const stockPoints = d.stock.reduce((s, c) => s + cardPoints(c, d.trump!), 0);
      expect(d.tally!.cardRaw[0] + d.tally!.cardRaw[1] + stockPoints).toBe(162);
      expect(d.score!.points.every((v) => Number.isInteger(v) && v >= 0)).toBe(true);
    }
  });

  it('dealer must choose in round two', () => {
    let d = startDeal2(0, mulberry32(3));
    d = trump2(d, 1, { type: 'pass' });
    d = trump2(d, 0, { type: 'pass' });
    expect(d.phase).toBe('trump2');
    d = trump2(d, 1, { type: 'pass' });
    expect(() => trump2(d, 0, { type: 'pass' })).toThrow();
    expect(() => trump2(d, 0, { type: 'name', strain: d.turnUp.suit, takeCard: false })).toThrow();
    expect(trumpOptions2(d, 0).name).toContain('NT');
  });

  it('round 1: taking gives the turned card, then +2 / +3', () => {
    const d0 = startDeal2(0, mulberry32(11));
    const d = trump2(d0, 1, { type: 'take' });
    expect(d.hands[1].some((c) => cardId(c) === cardId(d0.turnUp))).toBe(true);
    expect(d.hands.map((h) => h.length)).toEqual([8, 8]);
    expect(d.stock.some((c) => cardId(c) === cardId(d0.turnUp))).toBe(false);
    expect(d.trump).toBe(d0.turnUp.suit);
  });

  it('round 2: taking the turned card is optional, Բոյ is allowed', () => {
    let d = startDeal2(0, mulberry32(12));
    d = trump2(trump2(d, 1, { type: 'pass' }), 0, { type: 'pass' });
    const without = trump2(d, 1, { type: 'name', strain: 'NT', takeCard: false });
    expect(without.trump).toBe('NT');
    expect(without.stock.some((c) => cardId(c) === cardId(d.turnUp))).toBe(true);
    const withCard = trump2(d, 1, { type: 'name', strain: 'NT', takeCard: true });
    expect(withCard.hands[1].some((c) => cardId(c) === cardId(d.turnUp))).toBe(true);
    expect(withCard.hands.map((h) => h.length)).toEqual([8, 8]);
    expect(withCard.stock).toHaveLength(8);
  });
});

describe('announcing and showing combinations', () => {
  // Seed with a known deal: find one where the first player holds a combination.
  function dealWithCombo(): { d: Deal4; seat: number } {
    for (let s = 1; s < 500; s++) {
      let d = startDeal4(0, mulberry32(s));
      d = bazar4(d, 1, { type: 'bid', bid: { level: 8, strain: 'H', kaput: false } });
      for (const seat of [2, 3, 0, 1]) d = bazar4(d, seat, { type: 'pass' });
      if (d.decl!.detected[1].length > 0) return { d, seat: 1 };
    }
    throw new Error('no deal with a combination');
  }

  it('announce before the first card, show before the second, then it scores', () => {
    let { d, seat } = dealWithCombo();
    expect(declareStage4(d, seat)).toBe('announce');
    d = announce4(d, seat, [0]);
    expect(d.decl!.announced[seat]).toHaveLength(1);
    expect(declareStage4(d, seat)).toBeNull();
    // Everyone plays the first trick.
    for (let i = 0; i < 4; i++) d = play4(d, d.turn, legalCards4(d, d.turn)[0]);
    // Play until it is our seat's turn in the second trick, then show.
    while (d.turn !== seat) d = play4(d, d.turn, legalCards4(d, d.turn)[0]);
    expect(declareStage4(d, seat)).toBe('show');
    d = show4(d, seat);
    expect(d.decl!.shown[seat]).toHaveLength(1);
    while (d.phase === 'play') d = play4(d, d.turn, legalCards4(d, d.turn)[0]);
    expect(d.combos!.perSeat[seat]).toHaveLength(1);
  });

  it('playing without showing loses the combination', () => {
    let { d, seat } = dealWithCombo();
    d = announce4(d, seat, [0]);
    while (d.phase === 'play') d = play4(d, d.turn, legalCards4(d, d.turn)[0]);
    expect(d.combos!.perSeat[seat]).toEqual([]);
  });

  it('playing the first card without announcing announces nothing', () => {
    let { d, seat } = dealWithCombo();
    d = play4(d, seat, legalCards4(d, seat)[0]);
    expect(d.decl!.announced[seat]).toEqual([]);
    expect(() => announce4(d, seat, [0])).toThrow();
  });
});

describe('matches', () => {
  it('4-player matches end with a winner', () => {
    for (let i = 0; i < 40; i++) {
      const rng = mulberry32(5000 + i);
      let m: Match4 = newMatch4(101, i);
      for (let steps = 0; m.winner === null; steps++) {
        expect(steps).toBeLessThan(20000);
        if (m.deal.phase === 'bazar') m = bazarMove4(m, ...randomBazar(m.deal, rng));
        else m = playMove4(m, m.deal.turn, pick(legalCards4(m.deal, m.deal.turn), rng));
      }
      expect([0, 1]).toContain(m.winner);
      const last = m.history[m.history.length - 1];
      expect(last.scoresAfter).toEqual(m.scores);
    }
  });

  it('dealer rotates to the left', () => {
    const m = newMatch4(101, 42);
    let cur: Match4 = m;
    const first = m.deal.dealer;
    for (const seat of [1, 2, 3, 0].map((k) => (first + k) % 4)) cur = bazarMove4(cur, seat, { type: 'pass' });
    expect(cur.deal.dealer).toBe((first + 1) % 4);
  });

  it('2-player matches end with a winner', () => {
    for (let i = 0; i < 40; i++) {
      const rng = mulberry32(9000 + i);
      let m: Match2 = newMatch2(101, i);
      for (let steps = 0; m.winner === null; steps++) {
        expect(steps).toBeLessThan(20000);
        const d = m.deal;
        if (d.phase === 'play') m = playMove2(m, d.turn, pick(legalCards2(d, d.turn), rng));
        else m = trumpMove2(m, d.turn, randomTrump(d, rng));
      }
      expect([0, 1]).toContain(m.winner);
    }
  });
});
