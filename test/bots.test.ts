import { describe, expect, it } from 'vitest';
import { type Match2, type Match4, bazarMove4, newMatch2, newMatch4, playMove2, playMove4, trumpMove2 } from '../src/engine';
import { botBazar4, botPlay2, botPlay4, botTrump2 } from '../src/bots';

function botMatch4(seed: number): Match4 {
  let m = newMatch4(151, seed);
  for (let steps = 0; m.winner === null; steps++) {
    if (steps > 20000) throw new Error('match did not end');
    const d = m.deal;
    if (d.phase === 'bazar') {
      const b = d.bazar;
      const seat = b.phase === 'awaitSur' ? b.current!.seat : b.turn;
      const action = botBazar4(b, seat, d.hands[seat]);
      expect(action).not.toBeNull();
      m = bazarMove4(m, seat, action!);
    } else m = playMove4(m, d.turn, botPlay4(d, d.turn));
  }
  return m;
}

function botMatch2(seed: number): Match2 {
  let m = newMatch2(101, seed);
  for (let steps = 0; m.winner === null; steps++) {
    if (steps > 20000) throw new Error('match did not end');
    const d = m.deal;
    m = d.phase === 'play' ? playMove2(m, d.turn, botPlay2(d, d.turn)) : trumpMove2(m, d.turn, botTrump2(d, d.turn));
  }
  return m;
}

describe('bots', () => {
  it('four bots finish 30 matches with legal moves', () => {
    let deals = 0;
    let made = 0;
    let redeals = 0;
    for (let i = 0; i < 30; i++) {
      const m = botMatch4(100 + i);
      for (const h of m.history) {
        if (h.bidder === null) redeals++;
        else {
          deals++;
          if (h.made) made++;
        }
      }
    }
    // Sanity: bots bid often enough and usually make what they bid.
    expect(deals).toBeGreaterThan(redeals);
    expect(made / deals).toBeGreaterThan(0.5);
  });

  it('two bots finish 30 matches with legal moves', () => {
    let deals = 0;
    let made = 0;
    for (let i = 0; i < 30; i++) {
      for (const h of botMatch2(200 + i).history) {
        deals++;
        if (h.made) made++;
      }
    }
    expect(made / deals).toBeGreaterThan(0.5);
  });
});
