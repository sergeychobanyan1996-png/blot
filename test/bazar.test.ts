import { describe, expect, it } from 'vitest';
import { type BazarAction, type BazarState, type Strain, applyBazar, contractOf, newBazar } from '../src/engine';

const bid = (level: number, strain: Strain, kaput = false): BazarAction => ({ type: 'bid', bid: { level, strain, kaput } });
const pass: BazarAction = { type: 'pass' };
const run = (moves: [number, BazarAction][], dealer = 0): BazarState =>
  moves.reduce((s, [seat, a]) => applyBazar(s, seat, a), newBazar(dealer));

describe('bazar (RULES Բ2)', () => {
  it('four «Լավ եմ» → redeal', () => {
    expect(run([[1, pass], [2, pass], [3, pass], [0, pass]]).phase).toBe('redeal');
  });

  it('three passes after a bid → last bidder may pass to fix the contract', () => {
    const s = run([[1, bid(8, 'H')], [2, pass], [3, pass], [0, pass]]);
    expect(s.phase).toBe('lastBidderOption');
    expect(s.turn).toBe(1);
    const done = applyBazar(s, 1, pass);
    expect(contractOf(done)).toEqual({ declarer: 1, team: 1, bid: { level: 8, strain: 'H', kaput: false }, contra: 0 });
  });

  it('last bidder may change the strain at the same level', () => {
    const s = run([[1, bid(10, 'H')], [2, pass], [3, pass], [0, pass], [1, bid(10, 'NT')], [2, pass], [3, pass], [0, pass], [1, pass]]);
    expect(contractOf(s).bid).toEqual({ level: 10, strain: 'NT', kaput: false });
  });

  it('repeating the same bid is illegal', () => {
    const s = run([[1, bid(10, 'H')], [2, pass], [3, pass], [0, pass]]);
    expect(() => applyBazar(s, 1, bid(10, 'H'))).toThrow();
  });

  it('a player who passed may bid later', () => {
    const s = run([[1, pass], [2, bid(8, 'S')], [3, pass], [0, pass], [1, bid(9, 'H')]]);
    expect(s.current).toEqual({ seat: 1, bid: { level: 9, strain: 'H', kaput: false } });
  });

  it('a bid must be higher; suits do not outrank each other', () => {
    const s = run([[1, bid(8, 'S')], [2, pass]]);
    expect(() => applyBazar(s, 3, bid(8, 'H'))).toThrow();
    expect(() => applyBazar(s, 3, bid(7, 'H'))).toThrow();
    expect(applyBazar(s, 3, bid(9, 'H')).current?.seat).toBe(3);
  });

  it('bids above 16 are allowed', () => {
    expect(run([[1, bid(20, 'H')]]).current?.bid.level).toBe(20);
  });

  it('only out-of-turn bids are rejected', () => {
    const s = run([[1, bid(8, 'S')]]);
    expect(() => applyBazar(s, 3, bid(9, 'H'))).toThrow();
  });

  it('contra out of turn closes the bazar; the declaring team may say սուր', () => {
    const s = run([[1, bid(9, 'H')], [0, { type: 'contra' }]]);
    expect(s.phase).toBe('awaitSur');
    expect(() => applyBazar(s, 2, { type: 'sur' })).toThrow();
    expect(() => applyBazar(s, 2, bid(10, 'S'))).toThrow();
    expect(contractOf(applyBazar(s, 3, { type: 'sur' })).contra).toBe(2);
    expect(contractOf(applyBazar(s, 1, pass)).contra).toBe(1);
  });

  it('a partner cannot contra', () => {
    const s = run([[1, bid(9, 'H')]]);
    expect(() => applyBazar(s, 3, { type: 'contra' })).toThrow();
  });

  it('after a capot only higher capots', () => {
    const s = run([[1, bid(25, 'H', true)]]);
    expect(() => applyBazar(s, 2, bid(26, 'S'))).toThrow();
    expect(applyBazar(s, 2, bid(26, 'S', true)).current?.bid.kaput).toBe(true);
  });
});
