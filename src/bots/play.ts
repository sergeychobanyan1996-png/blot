// Card-play heuristic shared by the 2- and 4-player bots (and by the strong bots' playouts).
// Always returns a legal card.

import { type Card, type Strain, cardPoints, rankStrength, trumpOf } from '../engine/cards';
import { type PlayedCard, winningIndex } from '../engine/tricks';

export interface PlayView {
  hand: readonly Card[];
  legal: readonly Card[];
  trick: readonly PlayedCard[];
  strain: Strain;
  seat: number;
  partner: number | null;
  trickSize: number;
  /** This bot's side made the contract / chose trump. */
  attacking: boolean;
  /** Cards still out: neither in this hand nor played. Enables card tracking. */
  unseen?: readonly Card[];
}

export function choosePlay(v: PlayView): Card {
  const trump = trumpOf(v.strain);
  const pts = (c: Card) => cardPoints(c, v.strain);
  const str = (c: Card) => rankStrength(c.rank, c.suit === trump);
  const isTrump = (c: Card) => c.suit === trump;
  const unseen = v.unseen;
  /** No card still out can beat it within its suit. */
  const isMaster = (c: Card) => !!unseen && !unseen.some((u) => u.suit === c.suit && str(u) > str(c));
  const cheapest = (cards: readonly Card[]) =>
    [...cards].sort((a, b) => Number(isTrump(a)) - Number(isTrump(b)) || pts(a) - pts(b) || str(a) - str(b))[0];
  const richest = (cards: readonly Card[]) =>
    [...cards].sort((a, b) => Number(isTrump(a)) - Number(isTrump(b)) || pts(b) - pts(a))[0];
  const strongest = (cards: readonly Card[]) => [...cards].sort((a, b) => str(b) - str(a))[0];

  if (v.trick.length === 0) {
    const trumps = v.legal.filter(isTrump);
    const othersHoldTrump = unseen ? unseen.some(isTrump) : true;
    // The attacking side draws trumps while the others still have some.
    if (trump && v.attacking && trumps.length && othersHoldTrump) {
      const top = strongest(trumps);
      if (top.rank === 'J' || trumps.length >= 3 || isMaster(top)) return top;
    }
    // Cash winners: cards nobody can beat in their suit.
    const masters = v.legal.filter((c) => !isTrump(c) && isMaster(c));
    if (masters.length) return richest(masters);
    const aces = v.legal.filter((c) => c.rank === 'A' && !isTrump(c));
    if (aces.length) return aces[0];
    return cheapest(v.legal);
  }

  const win = v.trick[winningIndex(v.trick, trump)];
  const last = v.trick.length === v.trickSize - 1;
  const winners = v.legal.filter((c) => winningIndex([...v.trick, { seat: v.seat, card: c }], trump) === v.trick.length);

  if (v.partner !== null && win.seat === v.partner) {
    const safe = last || isTrump(win.card) || win.card.rank === 'A' || isMaster(win.card);
    return safe ? richest(v.legal) : cheapest(v.legal);
  }
  if (winners.length) {
    if (last) return [...winners].sort((a, b) => str(a) - str(b) || pts(a) - pts(b))[0];
    const trickPoints = v.trick.reduce((s, p) => s + pts(p.card), 0);
    const best = strongest(winners);
    return trickPoints >= 10 || !isTrump(best) || isMaster(best) ? best : cheapest(winners);
  }
  return cheapest(v.legal);
}
