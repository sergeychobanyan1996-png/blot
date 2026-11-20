// Duplicate comparison: every deal is played twice with the same cards and the two bot levels
// swapping seats, so the luck of the deal cancels out. Checks that higher levels play better.

import { describe, expect, it } from 'vitest';
import { bazar4, mulberry32, play4, startDeal2, startDeal4, play2, trump2, teamOf4 } from '../src/engine';
import { type BotLevel, botBazar4, botPlay2, botPlay4, botTrump2, toLevel } from '../src/bots';

function runDeal4(seed: number, levelOfTeam: [BotLevel, BotLevel], timing: number[]): number[] {
  const rng = mulberry32(seed * 31 + 7);
  let d = startDeal4(seed % 4, mulberry32(seed));
  const lvl = (seat: number) => levelOfTeam[teamOf4(seat)];
  const timed = <T>(seat: number, fn: () => T): T => {
    const t0 = performance.now();
    const out = fn();
    if (lvl(seat) === 10) timing.push(performance.now() - t0);
    return out;
  };
  while (d.phase === 'bazar') {
    const b = d.bazar;
    const seat = b.phase === 'awaitSur' ? b.current!.seat : b.turn;
    const action = timed(seat, () => botBazar4(b, seat, d.hands[seat], lvl(seat), rng))!;
    d = bazar4(d, seat, action);
  }
  if (d.phase === 'redeal') return [0, 0];
  while (d.phase === 'play') {
    const seat = d.turn;
    const dd = d;
    d = play4(d, seat, timed(seat, () => botPlay4(dd, seat, lvl(seat), rng)));
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

/** Average points per deal that `hi` gains over `lo`. */
function edge4(hi: BotLevel, lo: BotLevel, deals: number, timing: number[] = []): number {
  let edge = 0;
  for (let i = 0; i < deals; i++) {
    const a = runDeal4(2000 + i, [hi, lo], timing);
    const b = runDeal4(2000 + i, [lo, hi], timing);
    edge += a[0] - a[1] + (b[1] - b[0]);
  }
  return edge / (2 * deals);
}

function edge2(hi: BotLevel, lo: BotLevel, deals: number): number {
  let edge = 0;
  for (let i = 0; i < deals; i++) {
    const a = runDeal2(6000 + i, [hi, lo]);
    const b = runDeal2(6000 + i, [lo, hi]);
    edge += a[0] - a[1] + (b[1] - b[0]);
  }
  return edge / (2 * deals);
}

describe('bot levels', () => {
  it('maps old saved values and bad input', () => {
    expect(toLevel('easy')).toBe(4);
    expect(toLevel('strong')).toBe(9);
    expect(toLevel(3)).toBe(3);
    expect(toLevel('x')).toBe(7);
    expect(toLevel(42)).toBe(7);
  });

  it('4 players: each step up the ladder wins points', () => {
    const timing: number[] = [];
    // Steps wide enough to stand out from the noise of 30 duplicate deals; neighbouring
    // levels near the top differ by only a few points.
    const steps: [BotLevel, BotLevel][] = [
      [2, 1],
      [4, 2],
      [7, 4],
      [10, 5],
    ];
    const results = steps.map(([hi, lo]) => [hi, lo, edge4(hi, lo, 30, timing)] as const);
    for (const [hi, lo, e] of results) console.log(`4p: level ${hi} vs ${lo}: ${e.toFixed(2)} points/deal`);
    console.log(`4p: level 10 avg move ${(timing.reduce((s, x) => s + x, 0) / timing.length).toFixed(1)}ms, slowest ${Math.max(...timing).toFixed(0)}ms`);
    for (const [, , e] of results) expect(e).toBeGreaterThan(0);
  }, 600_000);

  it('2 players: higher levels win points', () => {
    const steps: [BotLevel, BotLevel][] = [
      [4, 1],
      [9, 4],
    ];
    const results = steps.map(([hi, lo]) => [hi, lo, edge2(hi, lo, 80)] as const);
    for (const [hi, lo, e] of results) console.log(`2p: level ${hi} vs ${lo}: ${e.toFixed(2)} points/deal`);
    for (const [, , e] of results) expect(e).toBeGreaterThan(0);
  }, 600_000);
});
