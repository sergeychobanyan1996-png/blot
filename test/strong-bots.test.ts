// Duplicate comparison: every deal is played twice with the same cards, strong and easy bots
// swapping seats, so luck of the deal cancels out.

import { describe, expect, it } from 'vitest';
import { bazar4, mulberry32, play4, startDeal2, startDeal4, play2, trump2, teamOf4 } from '../src/engine';
import { type BotLevel, botBazar4, botPlay2, botPlay4, botTrump2 } from '../src/bots';

function runDeal4(seed: number, levelOfTeam: [BotLevel, BotLevel], timing: number[]): number[] {
  const rng = mulberry32(seed * 31 + 7);
  let d = startDeal4(seed % 4, mulberry32(seed));
  const lvl = (seat: number) => levelOfTeam[teamOf4(seat)];
  while (d.phase === 'bazar') {
    const b = d.bazar;
    const seat = b.phase === 'awaitSur' ? b.current!.seat : b.turn;
    const t0 = performance.now();
    const action = botBazar4(b, seat, d.hands[seat], lvl(seat), rng)!;
    if (lvl(seat) === 'strong') timing.push(performance.now() - t0);
    d = bazar4(d, seat, action);
  }
  if (d.phase === 'redeal') return [0, 0];
  while (d.phase === 'play') {
    const seat = d.turn;
    const t0 = performance.now();
    const card = botPlay4(d, seat, lvl(seat), rng);
    if (lvl(seat) === 'strong') timing.push(performance.now() - t0);
    d = play4(d, seat, card);
  }
  return d.score!.points;
}

function runDeal2(seed: number, levels: [BotLevel, BotLevel]): number[] {
  const rng = mulberry32(seed * 17 + 3);
  let d = startDeal2(seed % 2, mulberry32(seed));
  while (d.phase === 'trump1' || d.phase === 'trump2') d = trump2(d, d.turn, botTrump2(d, d.turn, levels[d.turn], rng));
  while (d.phase === 'play') d = play2(d, d.turn, botPlay2(d, d.turn, levels[d.turn], rng));
  return d.score!.points;
}

describe('strong bots beat easy bots', () => {
  it('4 players, duplicate deals', () => {
    const timing: number[] = [];
    let edge = 0;
    const deals = 40;
    for (let i = 0; i < deals; i++) {
      const a = runDeal4(1000 + i, ['strong', 'easy'], timing);
      const b = runDeal4(1000 + i, ['easy', 'strong'], timing);
      edge += a[0] - a[1] + (b[1] - b[0]);
    }
    const avg = edge / (2 * deals);
    const slowest = Math.max(...timing);
    console.log(`4p: strong edge ${avg.toFixed(2)} points/deal, avg move ${(timing.reduce((s, x) => s + x, 0) / timing.length).toFixed(1)}ms, slowest ${slowest.toFixed(0)}ms`);
    expect(avg).toBeGreaterThan(1);
  }, 300_000);

  it('2 players, duplicate deals', () => {
    let edge = 0;
    const deals = 80;
    for (let i = 0; i < deals; i++) {
      const a = runDeal2(5000 + i, ['strong', 'easy']);
      const b = runDeal2(5000 + i, ['easy', 'strong']);
      edge += a[0] - a[1] + (b[1] - b[0]);
    }
    const avg = edge / (2 * deals);
    console.log(`2p: strong edge ${avg.toFixed(2)} points/deal`);
    expect(avg).toBeGreaterThan(1);
  }, 300_000);
});
